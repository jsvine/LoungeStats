// ==UserScript==
// @name        LoungeStats
// @namespace   LoungeStats
// @author      Kinsi http://reddit.com/u/kinsi55
// @include     http://csgolounge.com/myprofile
// @include     http://dota2lounge.com/myprofile
// @include     https://csgolounge.com/myprofile
// @include     https://dota2lounge.com/myprofile
// @version     0.3.9
// @require     http://loungestats.kinsi.me/dl/jquery-2.1.1.min.js
// @require    	http://loungestats.kinsi.me/dl/jquery.jqplot.min.js
// @require     http://loungestats.kinsi.me/dl/jqplot.cursor.min.js
// @require    	http://loungestats.kinsi.me/dl/jqplot.dateAxisRenderer.min.js
// @require     http://loungestats.kinsi.me/dl/jqplot.highlighter.min.js
// @require     http://loungestats.kinsi.me/dl/datepickr_mod.min.js
// @downloadURL http://loungestats.kinsi.me/dl/LoungeStats.user.js
// @updateURL   http://loungestats.kinsi.me/dl/LoungeStats.user.js
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_listValues
// ==/UserScript==

// You are not allowed to share modified versions of this script, or use parts of it without the authors permission
// You are not allowed to sell the whole, or parts of this script
// Copyright belongs to "Kinsi" (user Kinsi55 on reddit, /id/kinsi on steam)


// This code is shit, i get nightmares when i have to maintain it
// It please dont try to understand it

var app_id = (window.location.hostname == 'dota2lounge.com' ? '570' : '730');
var cleanparse = false;
var inexactAlert = false;
var bets = {};
var version = GM_info.script.version;
var newVersion = (GM_getValue('LoungeStats_lastversion') != version);

if(localStorage['LoungeStats_lastversion'] && version == '0.3.8' && confirm("Thanks for updating to LoungeStats 0.3.8. In this update i switched the way i save settings / cache items to be more stable. Due do this, i will convert over the values from the old method to the new one now. Your browser might lag for up to a minute, depending on your computer and bet history size (This only has to be done once, click OK to start, or Cancel to not convert over the data and re-load all prices)")) {
	for(var lSKey in localStorage) {
		if(lSKey.indexOf("LoungeStats") !== 0) continue;

		if(lSKey == 'LoungeStats_accounts'){
			GM_setValue(lSKey, JSON.stringify({aval:{'570': {}, '730': {}}, active:{'570': [], '730': []}}));
		}else{
			GM_setValue(lSKey.replace("LoungeStats_betcache", "LoungeStats_betcache_g"+app_id), localStorage[lSKey]);
		}
		//console.log("Converting "+lSKey+" from LocalStorage to GM Values.. ("+localStorage[lSKey]+")");

		localStorage.removeItem(lSKey);
	}

	alert("Im sorry, but converting everything is not possible. All your cached bets and item prices are still there, you need to open LoungeStats with every account that was there before though once again for everything to show up.");

	GM_setValue('LoungeStats_lastversion', version);
}

var setting_method = GM_getValue('LoungeStats_setting_method');
var setting_currency = GM_getValue('LoungeStats_setting_currency');
var setting_bvalue = GM_getValue('LoungeStats_setting_bvalue');
var setting_xaxis = GM_getValue('LoungeStats_setting_xaxis');
var setting_debug = GM_getValue('LoungeStats_setting_debug');
var setting_beforedate = GM_getValue('LoungeStats_setting_beforedate');
var setting_domerge = GM_getValue('LoungeStats_setting_domerge');
var setting_hideclosed = GM_getValue('LoungeStats_setting_hideclosed');

var loading = false;
var user_steam64 = $('#profile .full:last-child input').val().split('=').pop();
var accounts = {aval:{'570': {}, '730': {}}, active:{'570': [], '730': []}};

if(GM_listValues().indexOf('LoungeStats_accounts') > -1) accounts = JSON.parse(GM_getValue('LoungeStats_accounts'));

function addAcc(id, name) {
	accounts.aval[app_id][id] = name;
	GM_setValue('LoungeStats_accounts', JSON.stringify(accounts));
}

var currencysymbol = '$';
var currencyText = 'USD';

function setCurrencySymbol(){
	if(setting_currency == '3') {
		currencysymbol = '€';
		currencyText = 'EUR';
	}
	else if(setting_currency == '2') {
		currencysymbol = '£';
		currencyText = 'GBP';
	}
	else if(setting_currency == '5') {
		currencysymbol = 'p';
		currencyText = 'RUB';
	}
	else if(setting_currency == '1') {
		currencysymbol = '$';
		currencyText = 'USD';
	} else {
		currencysymbol = 'R$';
		currencyText = 'BRL';
	}
}

//Well, since you cant force the market price (exact algo) this has to do the trick.
var curr_usd_eur = 1.091355;
var curr_usd_gbp = 1.55791;
var curr_usd_rub = 0.016831;
var curr_usd_brd = 0.29671;

//http://stackoverflow.com/a/6700/3526458
Object.size = function(obj) {
	var size = 0, key;
	for (key in obj) {
		if (key in obj) size++;
	}
	return size;
};
//http://stackoverflow.com/a/6562764/3526458
function clearSelection() {
	if(document.selection) {
		document.selection.empty();
	} else if(window.getSelection) {
		window.getSelection().removeAllRanges();
	}
}
//http://stackoverflow.com/a/5812341/3526458
function isValidDate(s) {
	var bits = s.split('.');
	var d = new Date(bits[2], bits[1] - 1, bits[0]);
	return d && (d.getMonth() + 1) == bits[1] && d.getDate() == Number(bits[0]);
}

function getLoungeBetHistory(callback) {
	$.ajax({
		url: 'ajax/betHistory.php',
		type: 'POST',
		success: function(data) {
			$.ajax({
				url: 'ajax/betHistoryArchives.php',
				type: 'POST',
				success: function(dataArchived) {callback(data.split('</tbody>')[0]+dataArchived.split('<tbody>')[1]);},
				error: function() {callback(null);}
			});
		},
		error: function() {callback(null);}
	});
}

function parseLoungeBetHistory(html, callback) {
	var doommeedd = $.parseHTML(html);
	var cacheWeapons = {}; bets = {}; var donerequests = 0;
	// Preparse, get all matches, all overal needed weapons and arrify them

	var gmlvs = GM_listValues();

	$($(doommeedd).find('tr:nth-child(3n+1)').get().reverse()).each(function(i, bet) {
		var betid = bet.children[2].children[0].href.split('=').pop();

		if(setting_debug == '1') console.log('Parsing match #' + betid);

		if((gmlvs.indexOf('LoungeStats_betcache_g'+app_id+'_s'+user_steam64+'_'+betid) === -1) || cleanparse || newVersion) {
			//Match wasnt cached, parse & cache...
			var date = bet.children[6].textContent;
			var matchoutcome = bet.children[1].children[0].classList[0];
			if(!matchoutcome) matchoutcome = "draw";
			var tocache = {'matchid': betid, 'date': date, 'intdate': new Date(Date.parse(date.replace(/-/g,' ') + ' +0')).getTime(), 'matchoutcome': matchoutcome, 'items': {'bet':[], 'won':[], 'lost':[]}};

			tocache.teams = [bet.children[2].children[0].textContent, bet.children[4].children[0].textContent];
			tocache.winner = (bet.children[4].style.fontWeight == 'bold')+0;

			var betItems = $(bet).next().find('div > div.name > b:first-child');
			var wonItems = $(bet).next().next().find('div > div.name > b:first-child');

			if (wonItems.length && wonItems.length > 0) tocache.matchoutcome = 'won'; // http://redd.it/3edctm

			//Iterate trough all the items and add them to an array
			$(betItems).each(function(i, item) {
				var itemname = item.textContent.trim();
				tocache.items.bet.push(itemname);
				if(wonItems.length === 0 && matchoutcome && matchoutcome != 'won' && matchoutcome != 'draw'/*matchoutcome == 'lost' Lounge admins are retarded*/) {
					tocache.items.lost.push(itemname);
				}
			});
			//if(matchoutcome == 'won') {
			$(wonItems).each(function(i, item) {
				var itemname = item.textContent.trim();
				tocache.items.won.push(itemname);
			});
			//}
			if(setting_debug == '1') console.log(tocache);

			GM_setValue('LoungeStats_betcache_g'+app_id+'_s'+user_steam64+'_'+betid, JSON.stringify(tocache));
		}
	});

	addAcc(user_steam64, $('#profile h1:first-child').text());

	console.log(accounts.active[app_id]);

	var useaccs = accounts.active[app_id];

	var bits = setting_beforedate.split('.');
	var d = new Date(bits[2], bits[1]-1, bits[0]).getTime();

	if(!setting_domerge || setting_domerge == '0') useaccs = [user_steam64];

	for(var x in useaccs) {
		var accid = useaccs[x];

		for(var lSKey in gmlvs) {
			lSKey = gmlvs[lSKey];

			if(lSKey.indexOf('LoungeStats_betcache_g'+app_id+'_s'+accid+'_') != -1) {
				var parsedStorage = JSON.parse(GM_getValue(lSKey));
				//var tocache = {'matchid': betid, 'date': date, 'matchoutcome': matchoutcome, 'items': {'bet':[], 'won':[], 'lost':[]}};
				//console.log(parsedStorage.matchoutcome);

				if(parsedStorage.intdate > d && (setting_hideclosed == '0' || parsedStorage.matchoutcome != 'draw')) {
					var key = parsedStorage.intdate.toString() + parsedStorage.matchid;
					if(!(key in bets)) {
						bets[key] = parsedStorage;
					} else {
						bets[key].items.bet = bets[key].items.bet.concat(parsedStorage.items.bet);
						bets[key].items.won = bets[key].items.won.concat(parsedStorage.items.won);
						bets[key].items.lost = bets[key].items.lost.concat(parsedStorage.items.lost);
					}
				}
			}
		}
	}

	for(var bet in bets) {
		var dabet = bets[bet];

		var itemarray = dabet.items.bet.concat(dabet.items.won).concat(dabet.items.lost);

		for(var i in itemarray) {
			var itemname = itemarray[i];
			var date = dabet.date;
			//var localKeyName = getItemKeyName(itemname, date);
			var x = Date.parse(date.replace(/-/g,' ') + ' +0');

			//since between 28.11.2014 and 30.11.2014 the market crashed and the price skyrocketed, i need to fix gabens shit.
			if(x>1417132800000&&x<1417395600000){
				date="2014-11-28 00:00:00";
			}

			if(cleanparse || !getItemPrice(itemname, date)) { /*|| (!(localKeyName in cacheWeapons)*/
				//Price of an item is needed thats not cached yet, add it to cache que
				if(setting_debug == '1') console.log('Added ' + itemname + ' To cache queue...');
				if(!cacheWeapons[itemname]) cacheWeapons[itemname] = [];
				if((setting_method !== '0' && cacheWeapons[itemname].indexOf(date) == -1) || cacheWeapons[itemname].length === 0) cacheWeapons[itemname].push(date);
				//cacheWeapons[localKeyName] = [itemname, date];
			}
		}
	}

	if(setting_debug == '1'){console.log('weapos to cache:'); console.log(cacheWeapons);}

	//iterate trough all the queud items that the price is needed of, get & cache it.
	var cancel = false;
	var cwlen = Object.size(cacheWeapons);

	if(cwlen > 0) {
		$('#loungestats_datacontainer').html('<progress id="loungestats_loadprogress" value="0" max="' + cwlen + '"></progress><br/>Loading uncached item prices<label id="loungestats_loadprogresslabel">(0/' + cwlen + ')</label>...');
		var aboutTime = [0,0,0,0,0,0,0,0,0,0];
		var startTick = new Date().getTime();

		getAllPrices(cacheWeapons, Object.keys(cacheWeapons), setting_method == '1' ? 380 : 560, 0, function(success) {
			if(success) {
				$('#loungestats_datacontainer').html('Generating stats... (If you can see this either you are using a calculator or, more likely, something went horribly wrong)');
				callback(true);
			} else {
				$('#loungestats_datacontainer').html('Could not connect to steam communitymarket API, try again later...');
				if(setting_method == '1') $('#loungestats_datacontainer').append('<br>If you keep getting this error try switching the parsing method to "Most exact <b>& safest</b>"');
				loading = false;
			}
		}, function(prog) {
			var endTick = new Date().getTime();
			aboutTime.shift();
			aboutTime.push(endTick-startTick);
			startTick = endTick;
			var eta = 0;
			for(var i = 0; i < 10; i++) eta += aboutTime[i];
			eta *= cwlen - prog;
			eta /= 600000;
			eta = parseInt(eta);

			if(eta >= 30){
				eta += ' Minute(s), Better grab some coffee..';
			}else{
				eta += ' Minute(s)';
			}

			$('#loungestats_loadprogress').val(prog);
			$('#loungestats_loadprogresslabel').html('(' + prog + '/' + cwlen + ')<br/>ETA: ~'+eta);
		}, setting_method !== '0');
	}
	else {
		$('#loungestats_datacontainer').html('Generating stats... (If you can see this either you are using a calculator or, more likely, something went horribly wrong)');
		callback(true);
	}
}

function plot_zomx(plot, minx, maxx) {
	if(!minx){
		plot.replot({ axes: {
			xaxis: {
				min: plot.axes.xaxis.min,
				max: plot.axes.xaxis.max
			},
			yaxis: {
				min: plot.axes.yaxis.min,
				max: plot.axes.yaxis.max
			},
		}});
	}else{
		plot.replot({ axes: {
			xaxis: {
				min: minx,
				max: maxx
			},
			yaxis: {
				min: null,
				max: null
			}
		}});
	}
	/*$('#loungestats_stats_text').html('<div id="loungestats_stats_text"><hr>Overall value of items won: ' + overallWon.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_stats_text').append('<br>Overall value of items lost: ' + overallLost.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_stats_text').append('<br>Overall won bets: ' + overallWonCount + '/' + parseInt(overallWonCount + overallLostCount) + ' (' + parseInt(100/parseInt(overallWonCount + overallLostCount)*parseInt(overallWonCount)) + '%)');
	$('#loungestats_stats_text').append('<br>Net value: ' + overallValue.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_stats_text').append('<br>Highest win: ' + biggestwin.toFixed(2) + ' ' + currencysymbol + '<a href="/match?m=' + biggestwinid + '"> (Match link)</a>');
	$('#loungestats_stats_text').append('<br>Highest loss: ' + biggestloss.toFixed(2) + ' ' + currencysymbol + '<a href="/match?m=' + biggestlossid + '"> (Match link)</a>');
	$('#loungestats_stats_text').append('<br>Longest losing streak: ' + losestreaklast + '<a id="loungestats_zoonon_lls" href="javascript:void(0)"> (Show on plot)</a>');
	$('#loungestats_stats_text').append('<br>Longest winning streak: ' + winstreaklast + '<a id="loungestats_zoonon_lws" href="javascript:void(0)"> (Show on plot)</a></div>');*/
}

function forceExcelDecimal(f, comma) {
	f = parseFloat(f).toFixed(2);
	if(comma) f = f.replace('.',',');
	return f;
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
	var absoluteIndex = 0;
	var betsKeys = Object.keys(bets).sort();

	if(betsKeys.length === 0){
		$('#loungestats_datacontainer').html('Looks like you dont have any bets with the set criteria');
		return;
	}

	var firstDate = bets[betsKeys[0]].intdate;
	var lastDate = bets[betsKeys[betsKeys.length-1]].intdate;


	for(var i in betsKeys) {
		var b = bets[betsKeys[i]];
		var betid = b.matchid;
		var betdate = b.date;
		//And, since i cached the "correct" value above for the market crash, i need to use it here too ofc.
		var x = Date.parse(betdate.replace(/-/g,' ') + ' +0');

		//since between 28.11.2014 and 30.11.2014 the market crashed and the price skyrocketed, i need to fix gabens shit.
		if(x>1417132800000&&x<1417395600000){
			betdate="2014-11-28 00:00:00";
		}

		var value = 0.0;
		var betValue = 0.0;
		var teamString = '';
		var mergeMatchWin = false;
		var wonOrlost = (b.matchoutcome == 'won' || b.matchoutcome == 'lost');

		if(wonOrlost) {
			teamString = '<b>'+b.teams[b.winner]+'</b> vs. '+b.teams[!b.winner+0];
			if(teamString == '<b></b> vs. ') teamString = 'Prediction';
		} else {
			teamString = b.teams.join(' vs. ');
		}
		var itemname, item, price;

		for(item in b.items.bet) {
			itemname = b.items.bet[item];
			betValue += getItemPrice(itemname, betdate);
		}

		if(setting_debug == '1') console.log('################################# ' + teamString + '(' + betid + ')');
		if(setting_debug == '1') console.log('>>>Winnings');
		if(setting_debug == '1') console.log(b.items.won);
		for(item in b.items.won) {
			itemname = b.items.won[item];
			price = getItemPrice(itemname, betdate);
			if(setting_debug == '1') console.log(itemname + ': ' + price + ' (' + betdate + ')');
			if(setting_debug == '1') console.log('Keyname: ' + getItemKeyName(itemname, betdate));
			value += price;
			overallWon += price;
		}

		if(setting_debug == '1') console.log('>>>Losses');
		if(setting_debug == '1') console.log(b.items.lost);

		for(item in b.items.lost) {
			itemname = b.items.lost[item];
			price = getItemPrice(itemname, betdate);
			if(setting_debug == '1') console.log(itemname + ': ' + price + ' (' + betdate + ')');
			if(setting_debug == '1') console.log('Keyname: ' + getItemKeyName(itemname, betdate));

			value -= price;
			overallLost += price;
		}
		if(setting_debug == '1') console.log('net change:' + value);
		overallValue += value;

		mergeMatchWin = (value >= 0);
		var truevalue = value.toFixed(2);

		if(last != mergeMatchWin && wonOrlost) {
			winstreaktemp = 0;
			losestreaktemp = 0;
			last = mergeMatchWin;
		}

		if(mergeMatchWin && wonOrlost) {
			//win
			if(value > biggestwin) {
				biggestwin = value;
				biggestwinid = betid;
			}
			winstreaktemp++;
			overallWonCount++;
			if(winstreaktemp > winstreaklast) {
				winstreakstart = i - (winstreaktemp-1);
				winstreaklast = winstreaktemp;
			}
			value = '+'+value.toFixed(2);
		}else if(wonOrlost) {
			//loss
			if((value * -1) > biggestloss) {
				biggestloss = value * -1;
				biggestlossid = betid;
			}

			losestreaktemp++;
			overallLostCount++;
			if(losestreaktemp > losestreaklast) {
				losestreakstart = i - (losestreaktemp-1);
				losestreaklast = losestreaktemp;
			}
			value = value.toFixed(2).toString();
		}

		if(setting_debug == '1') console.log('node(' + b.date + ')->' + overallValue);

		chartData.push([setting_xaxis == '0' ? b.date : absoluteIndex, parseFloat(overallValue.toFixed(2)), betValue, value, teamString, truevalue]);
		if(setting_bvalue == 1) betData.push([setting_xaxis == '0' ? b.date : absoluteIndex, betValue, teamString]);
		absoluteIndex++;
	}

	//generate DOM content
	$('#loungestats_datacontainer').empty();
	$('#loungestats_datacontainer').append('<a id="loungestats_fullscreenbutton" class="button">Toggle Fullscreen</a><div id="loungestats_profitgraph" class="jqplot-target"></div>');

	var boundary = parseInt(absoluteIndex * 0.05); if(boundary === 0) boundary = 1;

	var xaxis_def = setting_xaxis == '0' ? {renderer:$.jqplot.DateAxisRenderer,tickOptions: {formatString: '%d %b %y'}, min: firstDate*0.9999,maxx: lastDate*1.0001} : {renderer: $.jqplot.LinearAxisRenderer, tickOptions: {formatString: '%i'}};

	var plot = $.jqplot('loungestats_profitgraph', [chartData, betData], {
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
		series:[{lineWidth:2, markerOptions:{show: false, style:'circle'}, highlighter: {formatString: '<strong>%s</strong><br>Overall Profit: %s<br>Value bet: %s<br>Value change: %s '  + currencysymbol + '<br>Game: %s'}},
						{lineWidth:1, markerOptions:{show: false, style:'circle'}, highlighter: {formatString: '<strong>%s</strong><br>Value bet: %s<br>Game: %s'/*, tooltipLocation: 'sw'*/}}],
		seriesColors: [ '#FF8A00', '#008A00' ]
	});

	$('#loungestats_profitgraph').bind('jqplotDataClick',
		function (ev, seriesIndex, pointIndex, data) {
			window.open('/match?m='+bets[betsKeys[pointIndex]].matchid,'_blank');
		}
	);

	$('#loungestats_profitgraph').bind('jqplotDataMouseOver', function () {
		$('.jqplot-event-canvas').css( 'cursor', 'pointer' );
	});

	$('#loungestats_profitgraph').on('jqplotDataUnhighlight', function() {
		$('.jqplot-event-canvas').css('cursor', 'crosshair');
	});

	if(setting_xaxis == '0') {
		$('#loungestats_profitgraph').dblclick(function() {plot_zomx(plot, firstDate*0.9999, lastDate*1.0001); clearSelection();});
		$('#loungestats_resetzoombutton').click(function() {plot_zomx(plot, firstDate*0.9999, lastDate*1.0001);});
	}else{
		//with the linearaxisrenderer, i cant pre-set minx, and maxx, lol.
		plot_zomx(plot, -boundary, absoluteIndex+boundary);
		$('#loungestats_profitgraph').dblclick(function() {plot_zomx(plot, -boundary, absoluteIndex+boundary); clearSelection();});
		$('#loungestats_resetzoombutton').click(function() {plot_zomx(plot, -boundary, absoluteIndex+boundary);});
	}

	$('#loungestats_fullscreenbutton').click(function() {toggleFullscreen(plot);plot_zomx(plot);});
	$('.hideuntilready').removeClass("hideuntilready");

	$(window).on('resize', function() {plot.replot();});

	$('#loungestats_datacontainer').append('<div id="loungestats_stats_text"></div>');

	$('#loungestats_stats_text').append('<hr>Overall value of items won: ' + overallWon.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_stats_text').append('<br>Overall value of items lost: ' + overallLost.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_stats_text').append('<br>Overall won bets: ' + overallWonCount + '/' + parseInt(overallWonCount + overallLostCount) + ' (' + parseInt(100/parseInt(overallWonCount + overallLostCount)*parseInt(overallWonCount)) + '%) <a class="info">?<p class="infobox">Draws are not counted into this, only losses & wins are counted in this stat</p></a>');
	$('#loungestats_stats_text').append('<br>Net value: ' + overallValue.toFixed(2) + ' ' + currencysymbol);
	$('#loungestats_stats_text').append('<br>Highest win: ' + biggestwin.toFixed(2) + ' ' + currencysymbol + '<a href="/match?m=' + biggestwinid + '"> (Match link)</a>');
	$('#loungestats_stats_text').append('<br>Highest loss: ' + biggestloss.toFixed(2) + ' ' + currencysymbol + '<a href="/match?m=' + biggestlossid + '"> (Match link)</a>');
	$('#loungestats_stats_text').append('<br>Longest losing streak: ' + losestreaklast + '<a id="loungestats_zoonon_lls" href="javascript:void(0)"> (Show on plot)</a>');
	$('#loungestats_stats_text').append('<br>Longest winning streak: ' + winstreaklast + '<a id="loungestats_zoonon_lws" href="javascript:void(0)"> (Show on plot)</a>');

	$('#loungestats_zoonon_lws').click(function() {
		plot_zomx(plot,chartData[winstreakstart][0],chartData[winstreakstart+winstreaklast][0]);
	}).removeAttr('id');
	$('#loungestats_zoonon_lls').click(function() {
		plot_zomx(plot,chartData[losestreakstart][0],chartData[losestreakstart+losestreaklast][0]);
	}).removeAttr('id');

	$('#loungestats_csvexport').click(function(){
		var useaccs = (!setting_domerge || setting_domerge == '0') ? [user_steam64] : accounts.active[app_id];
		var d = new Date();

		var csvContent = 'data:application/csv; charset=charset=iso-8859-1, Users represented in Export(SteamID64):;="' + useaccs.join(', ') + '"\n \
											Time of Export:;' + d.getUTCDate() + '-' + d.getUTCMonth() + '-' + d.getUTCFullYear() + ' ' + d.getUTCHours() + ':' + d.getUTCMinutes() + '\n \
											Currency:;'+currencyText+'\n \
											Bet Data:\n \
											Game;Date;Match ID;Bet Outcome;Bet Value;Value Change;Overall Profit;Bet Items;Won Items;Lost Items\n';

		for(var i in betsKeys) {
			var b = bets[betsKeys[i]];
			var c = chartData[i];
			var betdate = b.date;

			csvContent += c[4].replace('<b>','[').replace('</b>',']') +';'+ b.date +';'+ b.matchid +';'+ b.matchoutcome +';'+ forceExcelDecimal(c[2],true) +';'+ forceExcelDecimal(c[5],true) +';'+ forceExcelDecimal(c[1],true) +';'+ b.items.bet.join(', ') +';'+ b.items.won.join(', ') +';'+ b.items.lost.join(', ') +'\n';
		}

		var encodedUri = encodeURI(csvContent);
		var link = document.createElement("a");
		link.setAttribute("href", encodedUri);
		link.setAttribute("download", "LoungeStats_Export.csv");
		link.click();
	}).removeAttr('id');

	$('#loungestats_screenshotbutton').click(function(){
		if($('#loungestats_screenshotbutton').text() != "Screenshot") return;
		alert("The Screenshot will be taken in 4 Seconds so that you can Hover a bet if you want to...\n\n You can also quickly put the graph in Fullscreen mode!");
		$('#loungestats_screenshotbutton').text("Waiting");
		setTimeout(function(){$('#loungestats_screenshotbutton').text("Waiting.")},1000);
		setTimeout(function(){$('#loungestats_screenshotbutton').text("Waiting..")},2000);
		setTimeout(function(){$('#loungestats_screenshotbutton').text("Waiting...")},3000);
		setTimeout(function(){
			$('#loungestats_screenshotbutton').text("Uploading...");
			//$('#loungestats_profitgraph').attr("style", "width: 900px; height: 450px;");
			//plot.replot();
			var canvas = $("#loungestats_profitgraph").find('.jqplot-grid-canvas, .jqplot-series-shadowCanvas, .jqplot-series-canvas, .jqplot-highlight-canvas');
			var w = canvas[0].width;
			var h = canvas[0].height;
			var newCanvas = $('<canvas/>').attr('width',w).attr('height',h)[0];
			var context = newCanvas.getContext("2d");
			context.fillStyle = "#FFF";
			context.fillRect(0, 0, w, h);
			context.fillStyle = "#000";
			$(canvas).each(function() {
				context.drawImage(this, this.style.left.replace("px",""), this.style.top.replace("px",""));
			});

			context.font="11px Arial";
			var yaxis = $("#loungestats_profitgraph .jqplot-yaxis");
			$(yaxis.children()).each(function() {
				context.fillText(this.textContent, 3, parseInt(this.style.top)+10);
			});
			var xaxis = $("#loungestats_profitgraph .jqplot-xaxis");
			$(xaxis.children()).each(function() {
				context.fillText(this.textContent, parseInt(this.style.left)+1, h-12);
			});
			var ttip = $("#loungestats_profitgraph .jqplot-highlighter-tooltip")[0];
			if(ttip.style.display != "none"){
				var topoffset = parseInt(ttip.style.top);
				if(topoffset < 20) topoffset = 20;
				context.font="16px Arial";
				context.fillStyle = "rgba(57,57,57,.8)";
				context.strokeStyle = "#808080";
				context.fillRect(parseInt(ttip.style.left), topoffset, ttip.clientWidth, ttip.clientHeight);
				context.lineWidth="1";
				context.rect(parseInt(ttip.style.left), topoffset, ttip.clientWidth, ttip.clientHeight);
				context.stroke();
				context.fillStyle = "rgba(220,220,220,.8)";
				var strs = ttip.innerHTML.replace(/<br>/g,"|").replace(/<.+?>/g,"").split("|");
				for(var i = 0; i < strs.length; i++) context.fillText(strs[i], parseInt(ttip.style.left)+5, topoffset+18+(i*16))
			}
			context.font="14px Arial";
			context.fillStyle = "#000";
			//$('#loungestats_profitgraph').removeAttr("style");
			//plot.replot();
			context.textAlign = 'center';
			context.font="bold 15px Arial";
			context.fillText("LoungeStats Profit Graph ("+(app_id == '730' ? "CS:GO" : "DotA")+") | http://reddit.com/r/LoungeStats", w/2, 17);

			$.ajax({
				url: 'https://api.imgur.com/3/image',
				type: 'post',
				headers: {
					Authorization: 'Client-ID 449ec55696fd751'
				},
				data: {
					image: newCanvas.toDataURL("image/jpeg", 0.92).replace("data:image/jpeg;base64,",""),
					title: "LoungeStats Profit Graph Autoupload",
					description: "Visit http://reddit.com/r/LoungeStats for more infos!"
				},
				dataType: 'json',
				success: function(response) {
					if(response.success) {
						var myPopup = window.open(response.data.link, "", "directories=no,height="+h+",width="+w+",menubar=no,resizable=no,scrollbars=no,status=no,titlebar=no,top=0,location=no");
						if (!myPopup)
							alert("Your Screenshot was uploaded, but looks like your browser blocked the PopUp!");
						else {
							$('#loungestats_screenshotbutton').text("Screenshot");
							myPopup.onload = function() {
								setTimeout(function() {
									if (myPopup.screenX === 0) alert("Your Screenshot was uploaded, but looks like your browser blocked the PopUp!");
								}, 0);
							};
						}
					}
				},
				error: function(){
					$('#loungestats_screenshotbutton').text("Screenshot");
					alert("Sorry, uploading the image to imgur failed :(\n\nTry it again in a second and doublecheck that imgur is up!");
				}
			});
		}, 4000);
	})
}

var activefast = 0;
var fastindex = 0;
var fastLooping = false;

function getAllPrices(itemarray, itemarraykeylist, delay, arrayoffset, callback, progresscallback, exact) {
	if(!arrayoffset) arrayoffset = 0;
	var item = itemarraykeylist[arrayoffset];
	var itemDates = itemarray[itemarraykeylist[arrayoffset]];

	if(!item) {
		if(activefast === 0) callback(true);
		return true;
	}
	if(exact) {
		//var betdate = new Date(Date.parse(loungetime.replace(/-/g,' ') + ' +0'));
		cacheItemsExact(item, itemDates, function(success) {
			if(success) {
				progresscallback(arrayoffset+1);
				//Recursively re-call myself with a delay until all prices are parsed, this is because the amount of requests to the market possible is limited
				setTimeout(function() {getAllPrices(itemarray, itemarraykeylist, delay, arrayoffset+1, callback, progresscallback, exact);}, delay);
			}
			else {
				$('#loungestats_datacontainer').html('Could not connect to steam communitymarket API, try again later...');
				if(setting_method == '1') $('#loungestats_datacontainer').append('<br>If you keep getting this error try switching the parsing method to "Most exact <b>& safest</b>"');
				callback(false);
			}
		});
	} else {
		if(arrayoffset === 0) fastindex = 0;
		fastLooping = true;
		while(activefast < 10 && fastindex < itemarraykeylist.length) {
			item = itemarraykeylist[fastindex];
			activefast++; fastindex++;
			cacheItem(item, function(success) {
				if(success) {
					activefast--;
					progresscallback(fastindex-activefast);//this actually is right, wat.
					if(!fastLooping) getAllPrices(itemarray, itemarraykeylist, delay, fastindex, callback, progresscallback, exact);
					if(setting_debug == '1') console.log(fastindex-activefast);
				} else {
					fastindex = itemarraykeylist.length +1;
					$('#loungestats_datacontainer').html('Could not connect to steam communitymarket API, try again later...');
					if(setting_method == '1') $('#loungestats_datacontainer').append('<br>If you keep getting this error try switching the parsing method to "Most exact <b>& safest</b>"');
					callback(false);
				}
			}, itemarray[item]);
		}
		fastLooping = false;
	}
}

//Converting usd to other currencies using static conversion rates (Thanks GabeN)
function convertUsd(usd) {
	if(usd < 0.02) usd = 0.02;
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

function convToUsdBySym(f, str){
	if(str.indexOf('R$') > -1) {
		f *= curr_usd_brd;
	}else if(str.indexOf('\u00a3') > -1) {
		f *= curr_usd_gbp;
	}else if(str.indexOf('&#8364;') > -1) {
		f *= curr_usd_eur;
	}else if(str.indexOf('p\u0443\u0431') > -1) {
		f *= curr_usd_rub;
	}else if(str.indexOf('$') > -1) {
		//hi
	} else { return false }
	return true;
}

function cacheItem(itemname, callback, exactfallback) {
	if(setting_debug == '1') console.log('Caching item price of ' + itemname + '...>>>>>>>>>>>>>>>>>>>>>>>>>>>');
	if(setting_debug == '1') console.log(getItemKeyName(itemname, ""));

	GM_xmlhttpRequest({
		method: 'GET',
		url: 'http://steamcommunity.com/market/priceoverview/?currency=' + GM_getValue('LoungeStats_setting_currency') + '&appid=' + app_id + '&market_hash_name=' + encodeURI(itemname),
		onload: function(response) {
			if(response.status == 200) {
				var responseParsed = JSON.parse(response.responseText);
				if(responseParsed.success === true && 'median_price' in responseParsed) {
					var price = parseFloat(responseParsed['median_price'].replace('$','').replace('\u00a3','').replace('&#8364;','').replace('p\u0443\u0431..','').replace('R','').replace(',', '.').trim());
					if(setting_debug == '1') console.log('Cached item price of ' + itemname + ' | Price: ' + price);
					if(setting_debug == '1') console.log(exactfallback);
					for(loungetime in exactfallback){
						var localKeyName = getItemKeyName(itemname, exactfallback[loungetime]);
						GM_setValue(localKeyName, price);
					}
					if(setting_debug == '1') console.log('');
					callback(true);
					return;
				}// No median price seems existant, attempt to use the lowest price
				else if(responseParsed.success == true && 'lowest_price' in responseParsed) {
					var price = parseFloat(responseParsed['lowest_price'].replace('$','').replace('\u00a3','').replace('&#8364;','').replace(' p\u0443u0431..','').replace('R','').replace(',', '.').trim());
					convToUsdBySym(price, responseParsed['lowest_price']);

					if(setting_debug == '1') console.log('Cached item price of ' + itemname + ' | Price: ' + price);

					for(loungetime in exactfallback){
						var localKeyName = getItemKeyName(itemname, exactfallback[loungetime]);
						GM_setValue(localKeyName, price);
					}
					callback(true);
					return;
				}// No lowest price seems existant, assume price as 0 since i cant do anything else really
				else if(setting_debug == '1') {
					console.log('Failed to load ' + itemname + ', assuming as 0');
				}
			}
			if(setting_debug == '1') console.log("X.X");
			for(loungetime in exactfallback){
				var localKeyName = getItemKeyName(itemname, exactfallback[loungetime]);
				GM_setValue(localKeyName, 0.0);
			}
			callback(true);
		}
	});
}

function cacheItemsExact(itemname, loungetimes, callback) {
	if(setting_debug == '1') console.log('Caching exact item prices of ' + itemname + '...');
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

					if(arr !== null) {
						for(var loungetimei in loungetimes){
							var localKeyName = getItemKeyName(itemname, loungetimes[loungetimei]);
							var betdate = new Date(Date.parse(loungetimes[loungetimei].replace(/-/g,' ') + ' +0'));

							var prev = null;
							//and iterate trough it here if it was found
							var p = 0.0;
							var prevp = 0.0;
							var datadate = null;
							for(var i in arr) {
								datadate = new Date(Date.parse(arr[i][0]));
								p = parseFloat(arr[i][1]);
								inexact = !convToUsdBySym(p, curr[0]);

								if((datadate >= betdate && (prev === null || prev < betdate)) || i == arr.length-1) {
									if(inexact && !inexactAlert) {
										inexactAlert = true;
										alert('For your Information. Since you are using the exact method you want exact prices. Because of this, i am alerting you that i cant provide exact prices for you sadly, the reason being that i dont know how to deal with your local currency. The best you can do is to select US$ as your currency, this will display values in your local currency. The alternative is to use the fast method because i can tell steam which currency i want the prices in for that, which i cant for the price history sadly. I\'m sorry for that');
									}

									if(prevp > 0.0 && p/prevp >= 3.0){
										if((arr.length - i) >= 3){
											var tempp = parseFloat(arr[parseInt(i)+3][1]);
											convToUsdBySym(tempp, curr[0]);

											if(p/tempp >= 3.0){
												p = (prevp + tempp) /2;
												datadate = datadate.toString + "(AVGD +3)";
											}
										}else{
											var tempp = parseFloat(arr[parseInt(i)-3][1]);
											convToUsdBySym(tempp, curr[0]);
											if(p/tempp >= 3.0){
												p = (prevp + tempp) /2;
												datadate = datadate.toString + "(AVGD -3)";
											}
										}
										console.log('Parsed: ' + datadate + ' Requested: ' + loungetimes[loungetimei]);
									}
									if(setting_debug == '1') console.log('Parsed: ' + datadate + ' Requested: ' + loungetimes[loungetimei]);
									GM_setValue(localKeyName, p);
									break;
								}
								prev = datadate;
								prevp = p;
							}
						}
						callback(true);
						return;
					}
				}
			}
			//otherwise attempt to use the inexact price instead of the exact price since i cant do anything else really
			if((response.responseText.indexOf('There is no price history available for this item yet.') > -1) || response.responseText.indexOf('There are no listings for this item.') > -1) {
				if(setting_debug == '1') console.log('Falling back to unexact price...');
				cacheItem(itemname, callback, loungetimes);
				return;
			}
			callback(false);
		}
	});
}
//Internal function for generating central GM_listValues() key names
function getItemKeyName(itemname, loungetime) {
	if(loungetime && setting_method !== '0') {
		var betdate = new Date(Date.parse(loungetime.replace(/-/g,' ') + ' +0'));
		return 'LoungeStats_itemexact_' + betdate.getUTCDate() + '_' + betdate.getUTCMonth() + '_' + betdate.getYear() + '_' + itemname.replace(/ /g, '_');
	} else {
		return 'LoungeStats_' + currencysymbol + 'item_' + itemname.replace(/ /g, '_');
	}
}

function getItemPrice(itemname, loungetime) {
	var localKeyName = getItemKeyName(itemname, loungetime);
	if(GM_getValue(localKeyName)) {
		if(loungetime && setting_method !== '0') {
			return convertUsd(parseFloat(GM_getValue(localKeyName)));
		}
		return parseFloat(GM_getValue(localKeyName));
	}
	return false;
}
//Main sub that handles most of the stuff
function loadStats(clean) {
	if(loading) {
		alert('I\'m already loading, sheesh.');
		return;
	}

	/*if(typeof(Storage) == void(0)) {
		$('#ajaxCont').html('Your browser does not seem to support GM_listValues(), update it and try again.');
		return;
	}*/
	else if(!setting_method) {
		$('#ajaxCont').html('Please set up Loungestats first');
		$('#loungestats_overlay').fadeIn(500);
		return;
	}

	$(window).off('resize');
	cleanparse = clean;
	$('#ajaxCont').html('<a id="loungestats_settingsbutton" class="button">LoungeStats Settings</a> \
											<a id="loungestats_reloadbutton" class="button hideuntilready">Refresh cache</a> \
											<a id="loungestats_resetzoombutton" class="button hideuntilready">Reset Zoom</a> \
											<a id="loungestats_screenshotbutton" class="button hideuntilready">Screenshot</a> \
											<a id="loungestats_csvexport" class="button hideuntilready">Export CSV (Excel)</a> \
											<a class="button" target="_blank" href="http://steamcommunity.com/tradeoffer/new/?partner=33309635&token=H0lCbkY3">Donate ♥</a> \
											<a class="button" target="_blank" href="http://reddit.com/r/LoungeStats">Subreddit</a> \
											<br><hr><br> \
											<div id="loungestats_datacontainer"> \
												<img src="../img/load.gif" id="loading" style="margin: 0.75em 2%"> \
											</div>');
	if(newVersion) {
		GM_setValue('LoungeStats_lastversion', version);
		$('#ajaxCont').prepend('<div id="loungestats_updateinfo" class="bpheader">LoungeStats was updated to ' + version + '!<br/>Please make sure to check <a href="http://reddit.com/r/loungestats">the subreddit</a> to see what changes were made!</div>');
	}

	$('#loungestats_reloadbutton').click(function() {loadStats(true);});

	$('#loungestats_settingsbutton').click(function() {
		$('#loungestats_overlay').fadeIn(500);

		var multiaccthing;

		if(app_id == 730) {
			multiaccthing = '<div>CS:GO Accounts</div>';
		} else {
			multiaccthing = '<div>DotA Accounts</div>';
		}

		for(var i in accounts.aval[app_id]) {
			if(accounts.active[app_id].indexOf(i) > -1) {
				multiaccthing += '<input type="checkbox" name="'+i+'" checked> "<a href="http://steamcommunity.com/profiles/'+i+'" target="_blank">'+accounts.aval[app_id][i]+'</a>"<br/>';
			} else {
				multiaccthing += '<input type="checkbox" name="'+i+'"> "<a href="http://steamcommunity.com/profiles/'+i+'" target="_blank">'+accounts.aval[app_id][i]+'</a>"<br/>';
			}
		}
		$('#loungestats_mergepicks').html(multiaccthing);
	}).removeAttr('id');
	loading = true;
	getLoungeBetHistory(function(data) {
		if(data !== null) {
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

function toggleFullscreen(jqplot) {
	if($('#loungestats_profitgraph').hasClass('fullsc')) {
		$('#loungestats_profitgraph').removeClass('fullsc');
		$('#loungestats_fullscreenbutton').removeClass('fullsc');
	} else {
		$('#loungestats_profitgraph').addClass('fullsc');
		$('#loungestats_fullscreenbutton').addClass('fullsc');
	}
	jqplot.replot();
}

//called when save is pressed in the settings
function saveSettings() {
	GM_setValue('LoungeStats_setting_method', $('#loungestats_method').val()); setting_method = GM_getValue('LoungeStats_setting_method');
	GM_setValue('LoungeStats_setting_currency', $('#loungestats_currency').val()); setting_currency = GM_getValue('LoungeStats_setting_currency');
	GM_setValue('LoungeStats_setting_bvalue', $('#loungestats_bgraph').val()); setting_bvalue = GM_getValue('LoungeStats_setting_bvalue');
	GM_setValue('LoungeStats_setting_xaxis', $('#loungestats_xaxis').val()); setting_xaxis = GM_getValue('LoungeStats_setting_xaxis');
	GM_setValue('LoungeStats_setting_debug', $('#loungestats_debug').val()); setting_debug = GM_getValue('LoungeStats_setting_debug');
	GM_setValue('LoungeStats_setting_domerge', $('#loungestats_domerge').val()); setting_domerge = GM_getValue('LoungeStats_setting_domerge');
	GM_setValue('LoungeStats_setting_hideclosed', $('#loungestats_hideclosed').val()); setting_hideclosed = GM_getValue('LoungeStats_setting_hideclosed');

	if(isValidDate($('#loungestats_beforedate').val())){
		GM_setValue('LoungeStats_setting_beforedate', $('#loungestats_beforedate').val()); setting_beforedate = GM_getValue('LoungeStats_setting_beforedate');
	} else {
		alert('The format of the given date is invalid! Use Day.Month.Year!');
		return;
	}

	accounts.active[app_id] = [];
	$('#loungestats_mergepicks input').each(function(i,c) {
		if(c.checked) accounts.active[app_id].push(c.name);
	});
	GM_setValue('LoungeStats_accounts', JSON.stringify(accounts));

	setCurrencySymbol();
	$('#loungestats_overlay').fadeOut(500);
	loadStats();
}

//I know that gm scripts are called on the documentReady, i like having it like this nevertheless.
function init() {
	$('section:nth-child(2) div:nth-child(1)').append('<a id="loungestats_tabbutton" class="button">LoungeStats</a>');
	GM_addStyle('.jqplot-highlighter-tooltip {background-color: #393938; border: 1px solid gray; padding: 5px; color: #ccc} \
							 .jqplot-xaxis {margin-top: 5px; font-size: 12px} \
							 .jqplot-yaxis {margin-right: 5px; width: 55px; font-size: 12px} \
							 .jqplot-yaxis-tick {text-align: right; width: 100%} \
							 #loungestats_overlay {z-index: 9000; display: none; top: 0px; left: 0px; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.4); position: fixed} \
							 #loungestats_settings_title {text-align: center; font-size: 12px; height: 40px; border: 2px solid #DDD; border-top: none; background-color: #EEE; width: 100%; margin-top: -10px; -webkit-border-radius: 0 0 5px 5px; border-radius: 0 0 5px 5px; padding: 10px 5px 0 5px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box;} \
							 #loungestats_settingswindow {font-size: 13px; z-index: 9001; padding: 10px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; position: relative; background-color: white; left: 50%; top: 50%; width: 300px; margin-left: -151px; height: 420px; margin-top: -211px; -webkit-border-radius: 5px; border-radius: 5px; -webkit-box-shadow: 0 0 10px -5px #000; box-shadow: 0 0 10px -5px #000; border: 1px solid gray; overflow: hidden;-webkit-transition: all 250ms ease-in-out;-moz-transition: all 250ms ease-in-out;-ms-transition: all 250ms ease-in-out;-o-transition: all 250ms ease-in-out;transition: all 250ms ease-in-out;} \
							 #loungestats_settingswindow.accounts {width: 500px; margin-left: -251px;} \
							 #loungestats_settings_leftpanel select, #loungestats_settings_leftpanel input{margin: 3px 0; width: 100%; height: 22px !important; padding: 0;} \
							 #loungestats_settings_leftpanel input{width: 274px;} \
							 #loungestats_fullscreenbutton{margin-right: 29px !important; margin-top: -5px !important; height: 14px; z-index: 8998; position: relative;} \
							 #loungestats_fullscreenbutton.fullsc{position: fixed;margin: 0 !important;right: 34px; top: -5px;} \
							 #loungestats_profitgraph{position: relative; height: 400px; clear: left; z-index: 322;} \
							 #loungestats_profitgraph.fullsc{background-color: #DDD;height: 100% !important;left: 0;margin: 0;position: fixed !important;top: 0;width: 100%;} \
							 #loungestats_settings_leftpanel{width: 278px; float: left;} \
							 #loungestats_settings_rightpanel{width: 188px; float: left; margin-left: 11px;} \
							 #loungestats_settings_panelcontainer{width: 500px;} \
							 #loungestats_datacontainer{position: relative;clear: both;} \
							 .jqplot-highlighter-tooltip{z-index: 8999;} \
							 #loungestats_updateinfo{text-align: center;} \
							 #loungestats_mergepicks{border:2px solid #ccc; height: 100px; overflow-y: scroll; height: 258px; padding: 5px;-moz-box-sizing: border-box;-webkit-box-sizing: border-box;box-sizing: border-box;} \
							 #loungestats_mergepicks div:first-child{font-weight: bold;} \
							 #loungestats_mergepicks input{height: 20px !important;vertical-align: middle;} \
							 #loungestats_datecontainer{position: relative;} \
							 #loungestats_stats_text a{color: blue;} \
							 .hideuntilready{display: none !important;}');

	GM_addStyle('.calendar {top: 5px !important; left: 108px !important; font-family: \'Trebuchet MS\', Tahoma, Verdana, Arial, sans-serif !important;font-size: 0.9em !important;background-color: #EEE !important;color: #333 !important;border: 1px solid #DDD !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;padding: 0.2em !important;width: 14em !important;}.calendar .months {background-color: #F6AF3A !important;border: 1px solid #E78F08 !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;color: #FFF !important;padding: 0.2em !important;text-align: center !important;}.calendar .prev-month,.calendar .next-month {padding: 0 !important;}.calendar .prev-month {float: left !important;}.calendar .next-month {float: right !important;}.calendar .current-month {margin: 0 auto !important;}.calendar .months .prev-month,.calendar .months .next-month {color: #FFF !important;text-decoration: none !important;padding: 0 0.4em !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;cursor: pointer !important;}.calendar .months .prev-month:hover,.calendar .months .next-month:hover {background-color: #FDF5CE !important;color: #C77405 !important;}.calendar table {border-collapse: collapse !important;padding: 0 !important;font-size: 0.8em !important;width: 100% !important;}.calendar th {text-align: center !important; color: black !important;}.calendar td {text-align: right !important;padding: 1px !important;width: 14.3% !important;}.calendar tr{border: none !important; background: none !important;}.calendar td span {display: block !important;color: #1C94C4 !important;background-color: #F6F6F6 !important;border: 1px solid #CCC !important;text-decoration: none !important;padding: 0.2em !important;cursor: pointer !important;}.calendar td span:hover {color: #C77405 !important;background-color: #FDF5CE !important;border: 1px solid #FBCB09 !important;}.calendar td.today span {background-color: #FFF0A5 !important;border: 1px solid #FED22F !important;color: #363636 !important;}');

	$('body').append('<div id="loungestats_overlay"> \
		<div id="loungestats_settingswindow"'+((setting_domerge == '1') ? ' class="accounts"' : '')+'> \
			<div id="loungestats_settings_title">Loungestats '+version+' Settings | by <a href="http://reddit.com/u/kinsi55">/u/kinsi55</a><br><br></div> \
			<div id="loungestats_settings_panelcontainer"> \
				<div id="loungestats_settings_leftpanel"> \
					Pricing accuracy <a class="info">?<p class="infobox"><br>Fastest: Use current item prices for all bets<br><br>Most accurate: Use item prices at approximately the time of the bet, as little delay as possible between requests<br><br>Most accurate & safest: Same as Most accurate, but with a bit more delay between requests</p></a>:<br> \
					<select id="loungestats_method"> \
						<option value="0">Fastest</option> \
						<option value="1">Most accurate</option> \
						<option value="2">Most accurate & safest</option> \
					</select><br> \
					Currency:<br> \
					<select id="loungestats_currency"> \
						<option value="1">US Dollar(Most exact)</option> \
						<option value="3">Euro</option> \
						<option value="2">Great British Pound</option> \
						<option value="5">Rubel</option> \
						<option value="7">Brazilian real</option> \
					</select><br> \
					Show bet value graph:<br> \
					<select id="loungestats_bgraph"> \
						<option value="1">Yes</option> \
						<option value="0">No</option> \
					</select><br> \
					Merge Accounts:<br> \
					<select id="loungestats_domerge"> \
						<option value="0">No</option> \
						<option value="1">Yes</option> \
					</select><br> \
					Exclude bets before <a class="info">?<p class="infobox"><br>Any bet that happened before the given date will be excluded. To disable this just pick any date before you started betting(e.g. set the year to 2000 or something)</p></a>:<br> \
					<div id="loungestats_datecontainer"> \
						<input id="loungestats_beforedate"><br> \
					</div> \
					X-Axis:<br> \
					<select id="loungestats_xaxis"> \
						<option value="0">Date</option> \
						<option value="1">Incrementing</option> \
					</select><br> \
					Dont show Closed bets:<br> \
					<select id="loungestats_hideclosed"> \
						<option value="0">No</option> \
						<option value="1">Yes</option> \
					</select><br> \
					Debug mode:<br> \
					<select id="loungestats_debug"> \
						<option value="0">Off</option> \
						<option value="1">On</option> \
					</select><br> \
				</div> \
				<div id="loungestats_settings_rightpanel"> \
					Accounts to merge <a class="info">?<p class="infobox"><br>Since you chose to merge accounts, select all acounts you want to be merged in the graph(The current one is NOT automatically included!)</p></a>:<br> \
					<div id="loungestats_mergepicks"></div> \
				</div> \
			</div> \
			<div style="position: absolute; bottom: 10px;"> \
				<a id="loungestats_settings_save" class="button">Save</a> \
				<a id="loungestats_settings_close" class="button">Close</a> \
			</div> \
		</div> \
	</div>');

	$('#loungestats_domerge').change(function() {
		if($('#loungestats_domerge').val() == 1) {
			$('#loungestats_settingswindow').addClass('accounts');
		} else {
			$('#loungestats_settingswindow').removeClass('accounts');
		}
	});

	if(setting_method) $('#loungestats_method').val(setting_method);
	if(setting_currency) $('#loungestats_currency').val(setting_currency);
	if(setting_bvalue) $('#loungestats_bgraph').val(setting_bvalue);
	if(setting_xaxis) $('#loungestats_xaxis').val(setting_xaxis);
	if(setting_debug) $('#loungestats_debug').val(setting_debug);
	if(setting_domerge) $('#loungestats_domerge').val(setting_domerge);
	if(setting_hideclosed) $('#loungestats_hideclosed').val(setting_hideclosed);

	if(setting_beforedate) {
		$('#loungestats_beforedate').val(setting_beforedate);
	} else {
		$('#loungestats_beforedate').val('01.01.2000');
		GM_setValue('LoungeStats_setting_beforedate', '01.01.2000');
		setting_beforedate = '01.01.2000';
	}

	new datepickr('loungestats_beforedate', {
		'dateFormat': 'd.m.Y'
	});

	$('.calendar').detach().appendTo('#loungestats_datecontainer');

	$('#loungestats_tabbutton').click(function() {loadStats(false);}).removeAttr('id');
	$('#loungestats_overlay, #loungestats_settings_close').click(function() {$('#loungestats_overlay').fadeOut(500);});
	$('#loungestats_settings_save').click(function() {saveSettings();});
	$('#loungestats_settingswindow #loungestats_beforedate, .calendar').click(function(e) {e.stopPropagation();});
	$('#loungestats_settingswindow').click(function(e) {e.stopPropagation();$('.calendar').css('display','none');});
}

setCurrencySymbol();
init();