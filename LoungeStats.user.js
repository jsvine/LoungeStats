// ==UserScript==
// @name				LoungeStats
// @namespace		LoungeStats
// @author			Kinsi http://reddit.com/u/kinsi55
// @include			http://csgolounge.com/myprofile
// @include     http://dota2lounge.com/myprofile
// @version			0.2.1
// @require			http://bibabot.de/stuff/jquery-2.1.1.min.js
// @require			http://bibabot.de/stuff/jquery.jqplot.min.js
// @require			http://bibabot.de/stuff/jqplot.cursor.min.js
// @require			http://bibabot.de/stuff/jqplot.dateAxisRenderer.min.js
// @require			http://bibabot.de/stuff/jqplot.highlighter.min.js
// @downloadURL http://bibabot.de/stuff/LoungeStats.user.js
// @updateURL		http://bibabot.de/stuff/LoungeStats.user.js
// @grant				GM_xmlhttpRequest
// @grant				GM_addStyle
// ==/UserScript==

// You are not allowed to share modified versions of this script
// You are not allowed to sell the whole, or parts of this script
// Copyright belongs to "Kinsi" (user Kinsi55 on reddit, /id/kinsi on steam)

var cleanparse = false;
var inexactAlert = false;
var bets = [];
var version = "0.2.1B";

var setting_method = localStorage['LoungeStats_setting_method'];
var setting_currency = localStorage['LoungeStats_setting_currency'];
var setting_bvalue = localStorage['LoungeStats_setting_bvalue'];
var setting_xaxis = localStorage['LoungeStats_setting_xaxis'];
var setting_debug = localStorage['LoungeStats_setting_debug'];
var loading = false;
var user_steam64 = $('#profile .full:last-child input').val().split('=').pop();

var currencysymbol = '$';

if(setting_currency == '3') {
	currencysymbol = '€';
}
else if(setting_currency == '2') {
	currencysymbol = '£';
}
else if(setting_currency == '5') {
	currencysymbol = 'р';
}

//Well, since you cant force the market price (exact algo) this has to do the trick.
var curr_usd_eur = 1.2937;
var curr_usd_gbp = 1.63336;
var curr_usd_rub = 0.027058;
var curr_usd_brd = 0.445971;

var app_id = window.location.hostname == 'dota2lounge.com' ? '570' : '730';

//http://stackoverflow.com/a/6700/3526458
Object.size = function(obj) {
	var size = 0, key;
	for (key in obj) {
		if (obj.hasOwnProperty(key)) size++;
	}
	return size;
};

function getLoungeBetHistory(callback) {
	if(app_id == '730') {
		$.ajax({
			url: 'ajax/betHistory.php',
			type: 'POST',
			success: function(data){callback(data)},
			error: function(){callback(null)}
		});
	} else {
		$.ajax({
			url: 'ajax/betHistory.php',
			type: 'POST',
			success: function(data){
				$.ajax({
					url: 'ajax/betHistoryArchives.php',
					type: 'POST',
					success: function(dataArchived){callback(data.split("</tbody>")[0]+dataArchived.split("<tbody>")[1])},
					error: function(){callback(null)}
				});
			},
			error: function(){callback(null)}
		});
	}
}

function parseLoungeBetHistory(html, callback) {
	var doommeedd = $.parseHTML(html);
	var cacheWeapons = {}; bets = []; var donerequests = 0;

	var nomatchcache = user_steam64 != localStorage['LoungeStats_cachedid'];

	// Preparse, get all matches, all overal needed weapons and arrify them
	//var arrayitemlength = $(doommeedd).find('tr:nth-child(3n+1)').length-1;

	$($(doommeedd).find('tr:nth-child(3n+1)').get().reverse()).each(function(i, bet) {
		//i=arrayitemlength-i;
		var betid = bet.children[2].children[0].href.split('=').pop();

		if(setting_debug == 1) console.log('Parsing match #' + betid);
		if(localStorage['LoungeStats_betcache_'+betid] && !cleanparse && !nomatchcache) {
			var parsedStorage = JSON.parse(localStorage['LoungeStats_betcache_'+betid]);
			var items = parsedStorage['items']['won'].concat(parsedStorage['items']['bet']);
			for(i in items) {
				var itemname = items[i];
				var localKeyName = getItemKeyName(itemname, parsedStorage['date']);
				if(!cacheWeapons[localKeyName] && !localStorage[localKeyName]) {
					//Price of an item is needed thats not cached yet, add it to cache que
					if(setting_debug == 1) console.log('Added ' + itemname + ' To cache que...');
					cacheWeapons[localKeyName] = [itemname, parsedStorage['date']];
				}
			}
			//Match was cached before, no need to do anything.
			bets.push(betid);
		} else {
			//Match wasnt cached, parse & cache...
			var date = bet.children[6].textContent;
			var matchoutcome = bet.children[1].children[0].classList[0];
			var tocache = {'date': date, 'matchoutcome': matchoutcome, 'items': {'bet':[], 'won':[]}};

			tocache['teams'] = [bet.children[2].children[0].textContent, bet.children[4].children[0].textContent];
			//tricky tricky, if the team you bet on is the second option this will take the second item out of the teams array and set the "bet" value to it, otherwise the first.
			tocache['winner'] = tocache['teams'][(bet.children[4].style["fontWeight"] == 'font-weight:bold')];
			//var betItems = $(bet).find('tr:nth-child('+(i*3+2)+') td:nth-child(2) div.name b'); ||much slower.
			var betItems = $(bet).next().find("div.item > div.name > b");

			//var wonItems = $(doommeedd).find('tr:nth-child('+(i*3+3)+') td:nth-child(2) div.name b'); ||366x slower
			var wonItems = $(bet).next().next().find("div.item > div.name > b:first-child");
			//Iterate trough all the items and add them to an array
			$(betItems).each(function(i, item) {
				var itemname = item.textContent.trim();
				var localKeyName = getItemKeyName(itemname, date);
				tocache['items']['bet'].push(itemname);

				if(cleanparse || (!cacheWeapons[localKeyName] && !getItemPrice(itemname, date))) {
					//Price of an item is needed thats not cached yet, add it to cache que
					if(setting_debug == 1) console.log('Added ' + itemname + ' To cache que(B)...');
					cacheWeapons[localKeyName] = [itemname, date];
				}
			});
			$(wonItems).each(function(i, item) {
				var itemname = item.textContent.trim();
				var localKeyName = getItemKeyName(itemname, date);
				tocache['items']['won'].push(itemname);

				if(cleanparse || (!cacheWeapons[localKeyName] && !getItemPrice(itemname, date))) {
					//Price of an item is needed thats not cached yet, add it to cache que
					if(setting_debug == 1) console.log('Added ' + itemname + ' To cache que(W)...');
					cacheWeapons[localKeyName] = [itemname, date];
				}
			});
			console.log("g");
			localStorage['LoungeStats_betcache_' + betid] = JSON.stringify(tocache);
			bets.push(betid);
		}
	});

	//Remember which user the bets were cached for
	localStorage['LoungeStats_cachedid'] = user_steam64;

	if(setting_debug == 1) console.log('cached weaps:'); console.log(cacheWeapons);

	//iterate trough all the que'd items that the price is needed of, get & cache it.
	var cancel = false;
	var cwlen = Object.size(cacheWeapons);

	if(cwlen > 0) {
		$('#loungestats_datacontainer').html('<progress id="loungestats_loadprogress" value="0" max="' + cwlen + '"></progress><br/>Loading uncached item prices<label id="loungestats_loadprogresslabel">(0/' + cwlen + ')</label>...');
		getAllPrices(cacheWeapons, Object.keys(cacheWeapons), setting_method == 1 ? 420 : 600, 0, function(success) {
			if(success) {
				$('#loungestats_datacontainer').html('Generating stats... (If you can see this either you are using a calculator or, more likely, something went horribly wrong)');
				callback(true);
			} else {
				$('#loungestats_datacontainer').html('Could not connect to steam communitymarket API, try again later...');
				loading = false;
			}
		}, function(prog) {
			$('#loungestats_loadprogress').val(prog);
			$('#loungestats_loadprogresslabel').html('(' + prog + '/' + cwlen + ')');
		}, setting_method != 0);
	}
	else {
		$('#loungestats_datacontainer').html('Generating stats... (If you can see this either you are using a calculator or, more likely, something went horribly wrong)');
		callback(true);
	}
}

function plot_zomx(plot, minx, maxx) {
	plot.replot({ axes: {
		xaxis: {
			min: minx,
			max: maxx
		}
	}});
}

function generateStatsPage() {
	var overallValue = 0.0;
	var overallWon = 0.0;
	var overallLost = 0.0;
	var overallWonCount = 0;
	var overallLostCount = 0;
	var biggestwin = 0.0;
	var biggestwinid = 0;
	var biggestloss = 0.0;
	var biggestlossid = 0;
	var winstreakstart = 0; var winstreaktemp = 0; var winstreaklast = 0;
	var losestreakstart = 0; var losestreaktemp = 0; var losestreaklast = 0;
	var last = null;

	var chartData = [];
	var betData = [];

	//iterate trough bets array
	for(var i in bets) {
		var betid = bets[i];
		var b = JSON.parse(localStorage['LoungeStats_betcache_' + betid]);

		var value = 0.0;
		var betValue = 0.0;

		if(b['matchoutcome'] == 'won' || b['matchoutcome'] == 'lost') {
			if(last != b['matchoutcome']) {
				winstreaktemp = 0;
				losestreaktemp = 0;
				last = b['matchoutcome'];
			}
			if(b['matchoutcome'] == 'won') {
				winstreaktemp++;
				overallWonCount++;
				if(winstreaktemp > winstreaklast) {
					winstreakstart = i - (winstreaktemp-1);
					winstreaklast = winstreaktemp;
				}
			} else {
				losestreaktemp++;
				overallLostCount++;
				if(losestreaktemp > losestreaklast) {
					losestreakstart = i - (losestreaktemp-1);
					losestreaklast = losestreaktemp;
				}
			}
		}

		if(b['matchoutcome'] == 'won') {
			for(var item in b['items']['won']) {
				var itemname = b['items']['won'][item];
				value += getItemPrice(itemname, b['date']);
			}

			overallWon += value;
			overallValue += value;
			if(value > biggestwin) {
				biggestwin = value;
				biggestwinid = betid;
			}
		}
		for(var item in b['items']['bet']) {
			var itemname = b['items']['bet'][item];
			betValue += getItemPrice(itemname, b['date']);
		}
		if(b['matchoutcome'] == 'lost') {
			value = betValue;
			overallLost += value;
			overallValue -= value;
			if(value > biggestloss) {
				biggestloss = value;
				biggestlossid = betid;
			}
		}
		if(setting_debug == 1) console.log('node(' + b['date'] + ')->' + overallValue);

		chartData.push([setting_xaxis == 0 ? b['date'] : i, parseFloat(overallValue.toFixed(2)), betValue, value, b['teams'].join(' vs. ')]);
		if(setting_bvalue == 1) {
			betData.push([setting_xaxis == 0 ? b['date'] : i, betValue, b['teams'].join(" vs. ")]);
		}
	}

	//generate DOM content
	$('#loungestats_datacontainer').empty();
	$('#loungestats_datacontainer').append('<a id="loungestats_fullscreenbutton" class="button">Toggle Fullscreen</a><div id="pricehistory" style="position: relative; height: 400px; clear: both;" class="jqplot-target"></div>');

	var xaxis_def = setting_xaxis == 0 ? {renderer:$.jqplot.DateAxisRenderer,tickOptions: {formatString: '%d %b %y'}} : {renderer: $.jqplot.LinearAxisRenderer};

	var plot = $.jqplot('pricehistory', [chartData, betData], {
		title:{text: 'Overall profit over time'},
		gridPadding:{left: 55, right: 35, top: 25, bottom: 25},
		axesDefaults:{ showTickMarks:false },
		axes:{
			xaxis: xaxis_def,
			yaxis: {
				pad: 1,
				tickOptions:{formatString: '%0.2f ' + currencysymbol, labelPosition: 'end', tooltipLocation: 'sw'}
			}
		},
		canvasOverlay: {show: true},
		grid: {gridLineColor: '#414141', borderColor: '#414141', background: '#373737'},
		cursor: {show: true, zoom: true, showTooltip: false},
		highlighter: {show: true, tooltipOffset: 20, fadeTooltip: true, yvalues: 4},
		series:[{lineWidth:2, markerOptions:{show: false, style:'circle'}, highlighter: {formatString: '<strong>%s</strong><br>Overall Profit: %s<br>Value bet: %s<br>Value won/lost: %s<br>Game: %s'}},
						{lineWidth:1, markerOptions:{show: false, style:'circle'}, highlighter: {formatString: '<strong>%s</strong><br>Value bet: %s<br>Game: %s', tooltipLocation: 'sw'}}],
		seriesColors: [ "#FF8A00", "#008A00" ]
	});

	$("#pricehistory").dblclick(function() {plot_zomx(plot, null, null)});

	$('#loungestats_fullscreenbutton').click(function() {toggleFullscreen(plot)});

	$(window).on('resize', function(event, ui) {plot.replot();});

	$('#loungestats_datacontainer').append('<hr>Overall value of items won: ' + overallWon.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_datacontainer').append('<br>Overall value of items lost: ' + overallLost.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_datacontainer').append('<br>Overall won bets: ' + overallWonCount + '/' + parseInt(overallWonCount + overallLostCount) + ' (' + parseInt(100/parseInt(overallWonCount + overallLostCount)*parseInt(overallWonCount)) + '%)');
	$('#loungestats_datacontainer').append('<br>Net value: ' + overallValue.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_datacontainer').append('<br>Highest win: ' + biggestwin.toFixed(2) + ' ' + currencysymbol + '<a href="/match?m=' + biggestwinid + '"> (Match link)</a>');
	$('#loungestats_datacontainer').append('<br>Highest loss: ' + biggestloss.toFixed(2) + ' ' + currencysymbol + '<a href="/match?m=' + biggestlossid + '"> (Match link)</a>');
	$('#loungestats_datacontainer').append('<br>Longest losing streak: ' + losestreaklast + '<a id="loungestats_zoonon_lls" href="javascript:void(0)"> (Show on plot)</a>');
	$('#loungestats_datacontainer').append('<br>Longest winning streak: ' + winstreaklast + '<a id="loungestats_zoonon_lws" href="javascript:void(0)"> (Show on plot)</a>');

	$('#loungestats_zoonon_lws').click(function() {
		plot_zomx(plot,chartData[winstreakstart][0],chartData[winstreakstart+winstreaklast][0]);
	}).removeAttr('id');
	$('#loungestats_zoonon_lls').click(function() {
		plot_zomx(plot,chartData[losestreakstart][0],chartData[losestreakstart+losestreaklast][0]);
	}).removeAttr('id');

	$('#loungestats_reloadbutton').show();
}

var activefast = 0;
var fastindex = 0;
var fastLooping = false;

function getAllPrices(itemarray, itemarraykeylist, delay, arrayoffset, callback, progresscallback, exact) {
	if(!arrayoffset) arrayoffset = 0;
	var item = itemarray[itemarraykeylist[arrayoffset]];

	if(!item) {
		if(activefast == 0) callback(true)
		return true;
	}
	if(exact) {
		//var betdate = new Date(Date.parse(loungetime.replace(/-/g,' ') + ' +0'));

		cacheItemExact(item[0], item[1], function(success) {
			if(success) {
				progresscallback(arrayoffset+1);
				//Recursively re-call myself with a delay until all prices are parsed, this is because the amount of requests to the market possible is limited
				setTimeout(function(){getAllPrices(itemarray, itemarraykeylist, delay, arrayoffset+1, callback, progresscallback, exact)}, delay);
			}
			else {
				$('#loungestats_datacontainer').html('Could not connect to steam communitymarket API, try again later...');
				callback(false);
			}
		});
	} else {
	if(arrayoffset == 0) fastindex = 0;
		fastLooping = true;
		while(activefast < 10 && fastindex < itemarraykeylist.length) {
			item = itemarray[itemarraykeylist[fastindex]];
			activefast++; fastindex++;
			cacheItem(item[0], function(success) {
				if(success) {
					activefast--;
					progresscallback(fastindex-activefast);//this actually is right, wat.
					if(!fastLooping) getAllPrices(itemarray, itemarraykeylist, delay, fastindex, callback, progresscallback, exact);
					if(setting_debug == 1) console.log(fastindex-activefast);
				}
				else {
					fastindex = itemarraykeylist.length +1;
					$('#loungestats_datacontainer').html('Could not connect to steam communitymarket API, try again later...');
					callback(false);
				}
			}, item[1]);
		}
		fastLooping = false;
	}
}

function cacheItem(itemname, callback, exactfallback) {
	if(setting_debug == 1) console.log('Caching item price of ' + itemname + '...');
	var localKeyName = getItemKeyName(itemname, exactfallback);

	GM_xmlhttpRequest({
		method: 'GET',
		url: 'http://steamcommunity.com/market/priceoverview/?currency=' + localStorage['LoungeStats_setting_currency'] + '&appid=' + app_id + '&market_hash_name=' + encodeURI(itemname),
		onload: function(response) {
			if(response.status == 200) {
				var responseParsed = JSON.parse(response.responseText);
				if(responseParsed.success == true && responseParsed.hasOwnProperty('median_price')) {
					var price = responseParsed['median_price'].replace('&#36;','').replace('&#163;','').replace('&#8364;','').replace('p&#1091;&#1073;.','').replace(',', '.').trim();
					if(setting_debug == 1) console.log('Cached item price of ' + itemname + ' | Price: ' + price);
					localStorage.setItem(localKeyName, price);
					callback(true);
					return;
				}// No median price seems existant, attempt to use the lowest price
				else if(responseParsed.success == true && responseParsed.hasOwnProperty('lowest_price')) {
					var price = parseFloat(responseParsed['lowest_price'].replace('&#36;','').replace('&#163;','').replace('&#8364;','').replace('p&#1091;&#1073;.','').replace(',', '.').trim());
					if(responseParsed['lowest_price'].indexOf('&#36;') > -1){
						//hi
					}
					else if(responseParsed['lowest_price'].indexOf('&#163;') > -1){
						price *= curr_usd_gbp;
					}
					else if(responseParsed['lowest_price'].indexOf('&#8364;') > -1){
						price *= curr_usd_eur;
					} else if(responseParsed['lowest_price'].indexOf('p&#1091;&#1073;') > -1){
						price *= curr_usd_rub;
					} else if(responseParsed['lowest_price'].indexOf('&#82;&#36;') > -1){
						price *= curr_usd_brd;
					}

					if(setting_debug == 1) console.log('Cached item price of ' + itemname + ' | Price: ' + price);
					localStorage.setItem(localKeyName, price);
					callback(true);
					return;
				}// No lowest price seems existant, assume price as 0 since i cant do anything else really
				else if(setting_debug == 1) {
					console.log('Failed to load ' + itemname + ', assuming as 0');
				}
			}
			localStorage.setItem(localKeyName, 0.0);
			callback(true);
		}
	});
}

//Converting usd to other currencies using static conversion rates (Thanks GabeN)
function convertUsd(usd)
{
	if(setting_currency == '3') {
		return usd / curr_usd_eur;
	}
	else if(setting_currency == '2') {
		return usd / curr_usd_gbp;
	}
	else if(setting_currency == '5') {
		return usd / curr_usd_rub;
	}
	else if(setting_currency == '7') {
		return usd / curr_usd_brd;
	}
	return usd;
}

function cacheItemExact(itemname, loungetime, callback) {
	if(setting_debug == 1) console.log('Caching exact item price of ' + itemname + '...');
	var betdate = new Date(Date.parse(loungetime.replace(/-/g,' ') + ' +0'));
	var localKeyName = getItemKeyName(itemname, loungetime);
	GM_xmlhttpRequest({
		method: 'GET',
		//tricky stuff, since i cant get the price history when im not logged in, im downloading the items market page. Even if there are not items on sale at that very moment
		//in the javascript there still is an array with the past price history
		url: 'http://steamcommunity.com/market/listings/' + app_id + '/' + encodeURI(itemname) + '?l=english',
		onload: function(response) {
			if(response.status == 200) {
				//which i do filter out with this regex pattern
				var rgx = /var line1=\[\[(.*)\]\]/.exec(response.responseText);
				var curr = /var strFormatPrefix[^]*?var strFormatSuffix[^]*?;/.exec(response.responseText);
				var inexact = false;

				if(rgx) {
					var arr = JSON.parse('[[' + rgx[1] + ']]');

					if(arr != null) {
						var prev = null;
						//and iterate trough it here if it was found
						var p = 0.0;
						for(var i in arr) {
							var datadate = new Date(Date.parse(arr[i][0]));
							p = parseFloat(arr[i][1]);

							if(curr[0].indexOf('&#36;') > -1) {
								//hi
							}
							else if(curr[0].indexOf('&#163;') > -1) {
								p *= curr_usd_gbp;
							}
							else if(curr[0].indexOf('&#8364;') > -1) {
								p *= curr_usd_eur;
							} else if(curr[0].indexOf('p&#1091;&#1073;') > -1){
								p *= curr_usd_rub;
							} else if(curr[0].indexOf('&#82;&#36;') > -1){
								p *= curr_usd_brd;
							} else { inexact = true }


							if(datadate >= betdate && (prev == null || prev < betdate)) {
								if(inexact && !inexactAlert) {
									inexactAlert = true;
									alert("For your Information. Since you are using the exact method you want exact prices. Because of this, i am alerting you that i cant provide exact prices for you sadly, the reason being that i dont know how to deal with your local currency. The best you can do is to select US$ as your currency, this will display values in your local currency. The alternative is to use the fast method because i can tell steam which currency i want the prices in for that, which i cant for the price history sadly. I'm sorry for that");
								}
								if(setting_debug == 1) console.log('Parsed: ' + datadate + ' Requested: ' + loungetime)
								localStorage[localKeyName] = p;
								callback(true);
								return;
							}
							prev = datadate;
						}
						if(setting_debug == 1) console.log('Parsed: ' + datadate + ' Requested: ' + loungetime)
						localStorage[localKeyName] = parseFloat(arr[i][1]);
						callback(true);
						return;
					}
				}
			}
			//otherwise attempt to use the inexact price instead of the exact price since i cant do anything else really
			if((response.responseText.indexOf('There is no price history available for this item yet.') > -1) || response.responseText.indexOf('There are no listings for this item.') > -1) {
				if(setting_debug == 1) console.log('Falling back to unexact price...');
				cacheItem(itemname, callback, loungetime);
				return;
			}
			callback(false);
		}
	});
}
//Internal function for generating central localstorage key names
function getItemKeyName(itemname, loungetime)
{
	if(loungetime && setting_method != 0) {
		var betdate = new Date(Date.parse(loungetime.replace(/-/g,' ') + ' +0'));
		return 'LoungeStats_itemexact_' + betdate.getUTCDate() + '_' + betdate.getUTCMonth() + '_' + betdate.getYear() + '_' + itemname.replace(/ /g, '_');
	} else {
		return 'LoungeStats_' + currencysymbol + 'item_' + itemname.replace(/ /g, '_');
	}
}

function getItemPrice(itemname, loungetime)
{
	var localKeyName = getItemKeyName(itemname, loungetime);
	if(localStorage[localKeyName]){
		if(loungetime && setting_method != 0) {
			return convertUsd(parseFloat(localStorage[localKeyName]));
		}
		return parseFloat(localStorage[localKeyName]);
	}
	return false;
}
//Main sub that handles most of the stuff
function loadStats(clean) {
	if(loading){
		alert('I\'m already loading, sheesh.')
		return;
	}

	if(typeof(Storage) == void(0)) {
		$('#ajaxCont').html('Your browser does not seem to support localstorage, update it and try again.');
		return;
	}
	else if(!setting_method) {
		$('#ajaxCont').html('Please set up Loungestats first');
		$('#loungestats_overlay').fadeIn(500);
		return;
	}
	cleanparse = clean;
	$('#ajaxCont').html('<a id="loungestats_settingsbutton" class="button">LoungeStats Settings</a> \
											<a id="loungestats_reloadbutton" class="button" style="display: none;">Refresh cache</a> \
											<a class="button" target="_blank" href="http://steamcommunity.com/tradeoffer/new/?partner=33309635&token=H0lCbkY3">Donate ♥</a> \
											<a class="button" target="_blank" href="http://reddit.com/r/LoungeStats">Subreddit</a> \
											<br><hr><br> \
											<div id="loungestats_datacontainer"> \
												<img src="../img/load.gif" id="loading" style="margin: 0.75em 2%"> \
											</div>');
	if(localStorage['lastversion'] != version){
		localStorage['lastversion'] = version
		$('#ajaxCont').prepend('<div id="loungestats_updateinfo" class="bpheader">LoungeStats was updated to ' + version + '!<br/>Please check <a href="http://reddit.com/r/loungestats">the subreddit</a> to see what changes were made</div>');
	}

	$('#loungestats_reloadbutton').click(function() {loadStats(true)});
	$('#loungestats_settingsbutton').click(function() {$('#loungestats_overlay').fadeIn(500)}).removeAttr('id');
	loading = true;
	getLoungeBetHistory(function(data) {
		if(data != null) {
			parseLoungeBetHistory(data, function(success) {
				if(success) {
					generateStatsPage();
				}
				loading = false;
			});
		} else {
			loading = false;
			$('#loungestats_datacontainer').html('Looks like Lounge is dead at the moment..');
		}
	});
}

function toggleFullscreen(jqplot)
{
	if($("#pricehistory").hasClass('fullsc')) {
		$('#pricehistory').removeClass('fullsc');
		$('#loungestats_fullscreenbutton').removeClass('fullsc');
	} else {
		$('#pricehistory').addClass('fullsc');
		$('#loungestats_fullscreenbutton').addClass('fullsc');
	}
	jqplot.replot();
}

//called when save is pressed in the settings
function saveSettings()
{
	localStorage['LoungeStats_setting_method'] = $('#loungestats_method').val(); setting_method = localStorage['LoungeStats_setting_method'];
	localStorage['LoungeStats_setting_currency'] = $('#loungestats_currency').val(); setting_currency = localStorage['LoungeStats_setting_currency'];
	localStorage['LoungeStats_setting_bvalue'] = $('#loungestats_bgraph').val(); setting_bvalue = localStorage['LoungeStats_setting_bvalue'];
	localStorage['LoungeStats_setting_xaxis'] = $('#loungestats_xaxis').val(); setting_xaxis = localStorage['LoungeStats_setting_xaxis'];
	localStorage['LoungeStats_setting_debug'] = $('#loungestats_debug').val(); setting_debug = localStorage['LoungeStats_setting_debug'];

	if(setting_currency == '3') {
		currencysymbol = '€';
	}
	else if(setting_currency == '2') {
		currencysymbol = '£';
	}
	else if(setting_currency == '5') {
		currencysymbol = 'р';
	}
	else if(setting_currency == '1') {
		currencysymbol = '$';
	}
	else {
		currencysymbol = 'R$';
	}
	$('#loungestats_overlay').fadeOut(500);
	loadStats();
}

//I know that gm scripts are called on the documentReady, i like having it like this nevertheless.
function init() {
	$('section:nth-child(2) div:nth-child(1)').append('<a id="loungestats_tabbutton" class="button">Stats</a>');
	GM_addStyle(".jqplot-highlighter-tooltip {background-color: #393938; border: 1px solid gray; padding: 5px; color: #ccc} \
							 .jqplot-xaxis {margin-top: 5px; font-size: 12px} \
							 .jqplot-yaxis {margin-right: 5px; width: 55px; font-size: 12px} \
							 .jqplot-yaxis-tick {text-align: right; width: 100%} \
							 #loungestats_overlay {z-index: 9000; display: none; top: 0px; left: 0px; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.4); position: fixed} \
							 #loungestats_settings_title {text-align: center; font-size: 12px; height: 40px; border: 2px solid #DDD; border-top: none; background-color: #EEE; width: 100%; margin-top: -10px; -webkit-border-radius: 0 0 5px 5px; border-radius: 0 0 5px 5px; padding: 10px 5px 0 5px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box;} \
							 #loungestats_settingswindow {font-size: 13px; z-index: 9001; padding: 10px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; position: relative; background-color: white; left: 50%; top: 50%; width: 300px; margin-left: -151px; height: 400px; margin-top: -201px; -webkit-border-radius: 5px; border-radius: 5px; -webkit-box-shadow: 0 0 10px -5px #000; box-shadow: 0 0 10px -5px #000; border: 1px solid gray; overflow: hidden;-webkit-transition: all 250ms ease-in-out;-moz-transition: all 250ms ease-in-out;-ms-transition: all 250ms ease-in-out;-o-transition: all 250ms ease-in-out;transition: all 250ms ease-in-out;} \
							 #loungestats_settingswindow.accounts {width: 500px; margin-left: -251px;} \
							 #loungestats_settingswindow select, #loungestats_settingswindow input{margin: 5px 0; width: 100%; height: 22px !important} \
							 #loungestats_fullscreenbutton{margin-right: 29px !important; margin-top: -5px !important; height: 14px; z-index: 8998; position: relative;} \
							 #loungestats_fullscreenbutton.fullsc{position: fixed;margin: 0 !important;right: 34px; top: -5px;} \
							 #pricehistory.fullsc{background-color: #ddd;height: 100% !important;left: 0;margin: 0;position: fixed !important;top: 0;width: 100%;} \
							 #loungestats_settings_leftpanel{width: 278px; float: left;} \
							 #loungestats_settings_rightpanel{width: 188px; float: left; margin-left: 8px;} \
							 #loungestats_settings_panelcontainer{width: 500px;} \
							 #loungestats_datacontainer{position: relative;clear: both;} \
							 .jqplot-highlighter-tooltip{z-index: 8999;} \
							 #loungestats_updateinfo{text-align: center;} \
							 #loungestats_mergepicks{border:2px solid #ccc; width:100%; height: 100px; overflow-y: scroll; height: 258px;} \
							 #loungestats_mergepicks input{height: 20px !important;vertical-align: middle;}");

	$('body').append('<div id="loungestats_overlay"> \
		<div id="loungestats_settingswindow"> \
			<div id="loungestats_settings_title">Loungestats '+version+' Settings | by <a href="http://reddit.com/u/kinsi55">/u/kinsi55</a><br><br></div> \
			Pricing accuracy <a class="info">?<p class="infobox"><br>Fastest: Use current item prices for all bets<br><br>Most accurate: Use item prices at approximately the time of the bet, as little delay as possible between requests<br><br>Most accurate & safest: Same as Most accurate, but with a bit more delay between requests</p></a>:<br> \
			<select id="loungestats_method"> \
				<option value="0">Fastest</option> \
				<option value="1">Most accurate</option> \
				<option value="2">Most accurate & safest</option> \
			</select><br><br> \
			Currency:<br> \
			<select id="loungestats_currency"> \
				<option value="1">US Dollar(Most exact)</option> \
				<option value="3">Euro</option> \
				<option value="2">Great British Pound</option> \
				<option value="5">Rubel</option> \
				<option value="7">Brazilian real</option> \
			</select><br><br> \
			Show bet value graph:<br> \
			<select id="loungestats_bgraph"> \
				<option value="1">Yes</option> \
				<option value="0">No</option> \
			</select><br><br> \
			X-Axis:<br> \
			<select id="loungestats_xaxis"> \
				<option value="0">Date</option> \
				<option value="1">Incrementing</option> \
			</select><br><br> \
			Debug mode:<br> \
			<select id="loungestats_debug"> \
				<option value="0">Off</option> \
				<option value="1">On</option> \
			</select><br><br> \
			<div style="position: absolute; bottom: 10px;"> \
				<a id="loungestats_settings_save" class="button">Save</a> \
				<a id="loungestats_settings_close" class="button">Close</a> \
			</div> \
		</div> \
	</div>');
	if(setting_method) {
		$('#loungestats_method').val(setting_method);
		$('#loungestats_currency').val(setting_currency);
		$('#loungestats_bgraph').val(setting_bvalue);
		$('#loungestats_xaxis').val(setting_xaxis);
		$('#loungestats_debug').val(setting_debug);
	}
	$('#loungestats_tabbutton').click(function() {loadStats(false);}).removeAttr('id');
	$('#loungestats_overlay, #loungestats_settings_close').click(function() {$('#loungestats_overlay').fadeOut(500);});
	$('#loungestats_settings_save').click(function() {saveSettings()});
	$('#loungestats_settingswindow').click(function(e) {return false;});
}

init();