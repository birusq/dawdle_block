var ytCategoryNamesById = {
    1: "Film & Animation",
    2: "Autos & Vehicles",
    10: "Music",
    15: "Pets & Animals",
    17: "Sports",
    18: "Short Movies",
    19: "Travel & Events",
    20: "Gaming",
    21: "Videoblogging",
    22: "People & Blogs",
    23: "Comedy",
    24: "Entertainment",
    25: "News & Politics",
    26: "Howto & Style",
    27: "Education",
    28: "Science & Technology",
    29: "Nonprofits & Activism",
    30: "Movies",
    31: "Anime/Animation",
    32: "Action/Adventure",
    33: "Classics",
    34: "Comedy",
    35: "Documentary",
    36: "Drama",
    37: "Family",
    38: "Foreign",
    39: "Horror",
    40: "Sci-Fi/Fantasy",
    41: "Thriller",
    42: "Shorts",
    43: "Shows",
    44: "Trailers"
}

var version = chrome.runtime.getManifest().version;

var API_KEY = "AIzaSyBOOn9y-bxB8LHk-5Q6NDtqcy9_FHj5RH4";

var UPDATE_INTERVAL = 1000;

var blocksetIds = [];

var blocksetDatas = {};

var blocksetTimesElapsed = {};

var blRegEx = [];
var wlRegEx = [];
var blYT = [];
var wlYT = [];

var listeners = [];

var initDone = false;

var currentWeekDay;

var generalOptions = {};

function defaultBlockset() {
    return {
        name: "Block set 0",
        annoyMode: false,
        timeAllowed: 600000, // milliseconds
        resetTime: 0, // milliseconds from midnight
        lastReset: (new Date()).getTime(), // millisecods from 1970
        activeDays: [true, true, true, true, true, true, true],
        activeTime: {from: 0, to: 0}, // milliseconds from midnight
        blacklist: [],
        whitelist: []
    };
}

function defaultTimesElapsed() {
    var res = {};
    for (var blocksetId of blocksetIds) {
        res[blocksetId] = 0;
    }
    return res;
}

var defaultGeneralOptions = {
    clockType: 24,
    displayHelp: true,
    darkTheme: false
}

var isUpdated = false;
var previousVersion = "";

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "update") {
        isUpdated = true;
        previousVersion = details.previousVersion;
    }
});


init();

function init() {
    //chrome.storage.local.clear();
    //chrome.storage.sync.clear();
    
    

    chrome.storage.sync.get({
        blocksetIds: [0],
        generalOptions: {}
    }, function (items) {
        generalOptions = items.generalOptions;
        addAbsentItems(generalOptions, defaultGeneralOptions);

        blocksetIds = items.blocksetIds;

        if (blocksetIds.length === 0) {
            initDone = true;
        }
        else {
            loadBlocksets();
        }
    });

    setInterval(update, UPDATE_INTERVAL);
    var nextMidnight = new Date().setHours(24, 0, 0, 0);
    setTimeout(midnightUpdate, nextMidnight - new Date().getTime() + 1000);
    currentWeekDay = new Date().getDay();
}

function loadBlocksets() {
    var k = 0;

    chrome.storage.sync.get({
        blocksetTimesElapsed: defaultTimesElapsed()
    }, (items) => {
        blocksetTimesElapsed = items.blocksetTimesElapsed;

        for (var blocksetId of blocksetIds) {
            chrome.storage.sync.get({
                [blocksetId]: defaultBlockset(blocksetId)
            }, (data) => {
                blocksetDatas[blocksetId] = data[blocksetId];
                addAbsentItems(blocksetDatas[blocksetId], defaultBlockset(blocksetId));
                generateLookUp(blocksetId);

                // time elapsed saving changed in 1.1.0
                if (isUpdated && previousVersion.includes("1.0.")) {
                    blocksetTimesElapsed[blocksetId] = blocksetDatas[blocksetId].timeElapsed;
                    delete blocksetDatas[blocksetId].timeElapsed;
                }

                k++;

                if (k === blocksetIds.length) {
                    initDone = true;
                    setupTimerReset();
                    setupActiveTimeUpdates();
                    evaluateAllTabs();

                    if (isUpdated && previousVersion.includes("1.0.")) {
                        saveElapsedTimes();
                    }
                }
            });
        }

    });
    
}

/**
 * Add items with default values to this object, if default object has them
 * Always do this before loading anything to account for updates, wich add new data to saves
 * @param {Object} object - object to check and modify
 * @param {Object} defaultObject - default
 */
function addAbsentItems(object, defaultObject) {
    var defKeys = Object.keys(defaultObject);
    var keys = Object.keys(object);
    for (defKey of defKeys) {
        if (!keys.includes(defKey)) {
            object[defKey] = defaultObject[defKey];
        }
    }
}


// Listen for updates in settings
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "blocksetChanged") {
        generateLookUp(message.id);
        setupTimerReset(message.id);
        setupActiveTimeUpdates(message.id);
        evaluateAllTabs();
    }
    else if (message.type === "blocksetDeleted") {
        deleteLookUp(message.id);
        if (timerResets[message.id] != undefined) {
            clearTimeout(timerResets[message.id]);
        }
        if (activeTimes[message.id] != undefined) {
            clearTimeout(activeTimes[message.id].from);
            clearTimeout(activeTimes[message.id].to); 
        }
    }
    else if (message.type === "generalOptionsChanged") {
        // Not really used yet
    }
    else if (message.type === "donate") {
        openDonationPage();
    }
});

// Timers to update tabs when needed
function setupTimerReset(blocksetId) {
    var now = new Date();
    var resetTime = new Date();

    resetTime.setSeconds(0, 0);

    var list;
    if (blocksetId === undefined) {
        list = blocksetIds;
    }
    else {
        list = [blocksetId];
    }

    for (id of list) {

        if (timerResets[id] != undefined) {
            clearTimeout(timerResets[id]);
        }

        var time = msToDate(blocksetDatas[id].resetTime);

        resetTime.setHours(time.getHours(), time.getMinutes());

        var lastReset = new Date(blocksetDatas[id].lastReset);

        if (now.getTime() >= resetTime.getTime() && lastReset.getTime() < resetTime.getTime()) {
            resetElapsedTime(id);
        }
        else if (now.getTime() >= resetTime.getTime() && lastReset.getTime() >= resetTime.getTime()) {
            // already done for today, set timeout for tomorrow's reset
            timerResets[id] = setTimeout(resetElapsedTime, resetTime.getTime() - now.getTime() + 86400000, id);
        }
        else if (now.getTime() < resetTime.getTime()) {
            // set timeout for later today
            timerResets[id] = setTimeout(resetElapsedTime, resetTime.getTime() - now.getTime(), id);
        }
    }
}

function setupActiveTimeUpdates(blocksetId) {
    var now = timeToMsSinceMidnight(new Date());

    var list;
    if (blocksetId === undefined) {
        list = blocksetIds;
    }
    else {
        list = [blocksetId];
    }

    for (id of list) {
        if (activeTimes[id] != undefined) {
            clearTimeout(activeTimes[id]);
        }

        var activeTimeFrom = blocksetDatas[id].activeTime.from;
        var activeTimeTo = blocksetDatas[id].activeTime.to;

        if (activeTimeFrom != activeTimeTo) {
            activeTimes[id] = {};
            if (activeTimeFrom >= now) {
                activeTimes[id].from = setTimeout(activeTimeUpdate, activeTimeFrom - now + 1000, id, "from"); // add one second of padding so eval functions are surely correct
            }
            else if (activeTimeFrom < now) {
                activeTimes[id].from = setTimeout(activeTimeUpdate, activeTimeFrom - now + 86400000 + 1000, id, "from"); // timefrom gone for today, set timer for tomorrow
            }
            if (activeTimeTo >= now) {
                activeTimes[id].to = setTimeout(activeTimeUpdate, activeTimeTo - now + 1000, id, "to");
            }
            else if (activeTimeTo < now) {
                activeTimes[id].to = setTimeout(activeTimeUpdate, activeTimeTo - now + 86400000 + 1000, id, "to"); 
            }
        }
    }
}

function msToDate(time) {
    var h = parseInt((time / (1000 * 60 * 60)) % 24);
    var m = parseInt((time / (1000 * 60)) % 60);
    var s = parseInt((time / 1000) % 60);
    return new Date(0, 0, 0, h, m, s);
}

function msToTimeDisplay(duration) {
    var isNegative = (duration < 0);

    duration = Math.abs(duration);
        
    var seconds = parseInt((duration / 1000) % 60);
    var minutes = parseInt((duration / (1000 * 60)) % 60);
    var hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return (isNegative ? "-": "") + hours + ":" + minutes + ":" + seconds;
}

function timeToMsSinceMidnight(time) {
    return (time.getSeconds() * 1000) + (time.getMinutes() * 60000) + (time.getHours() * 3600000);
}

var timerResets = {};

function resetElapsedTime(id) {
    blocksetTimesElapsed[id] = 0;
    blocksetDatas[id].lastReset = (new Date()).getTime();
    timerResets[id] = setTimeout(resetElapsedTime, 86400000, id); // 86 400 000 ms is 1 day
    saveElapsedTimes();
}

/** 
 * Updates current weekday
 * Rechecks all tabs
 * Schedules next midnightupdate
 */
function midnightUpdate() {
    currentWeekDay = new Date().getDay();
    evaluateAllTabs();
    var nextMidnight = new Date(new Date().setHours(24, 0, 0, 0));
    setTimeout(midnightUpdate, nextMidnight - new Date().getTime() + 1000);
}

var activeTimes = {};

function activeTimeUpdate(id, type) {
    evaluateAllTabs();
    activeTimes[id][type] = setTimeout(activeTimeUpdate, 86400000, id, type);
}

function evaluateAllTabs() {
    chrome.tabs.query({}, function (tabs) {
        for (tab of tabs) {
            evaluateTab(tab);
        }
    });
}

// Lookup tables
function generateLookUp(blocksetId) {
    deleteLookUp(blocksetId);
    convertToRegEx(blocksetDatas[blocksetId].blacklist, blRegEx[blocksetId], blYT[blocksetId]);
    convertToRegEx(blocksetDatas[blocksetId].whitelist, wlRegEx[blocksetId], wlYT[blocksetId]);
}

function deleteLookUp(blocksetId) {
    blRegEx[blocksetId] = [];
    wlRegEx[blocksetId] = [];
    blYT[blocksetId] = {channels: [], categories: []};
    wlYT[blocksetId] = {channels: [], categories: []};
}

function convertToRegEx(fromList, toList, extraYT) {
    for (var i = 0; i < fromList.length; i++) {
        var type = fromList[i].type;
        if (type === "urlContains") {
            toList[toList.length] = new RegExp(fromList[i].value);
        }
        else if (type === "urlEquals") {
            toList[toList.length] = new RegExp("^" + fromList[i].value + "$");
        }
        else if (type === "urlPrefix") {
            toList[toList.length] = new RegExp("^" + fromList[i].value);
        }
        else if (type === "urlSuffix") {
            toList[toList.length] = new RegExp(fromList[i].value + "$");
        }
        else if (type === "ytChannel") {
            extraYT.channels[extraYT.channels.length] = fromList[i].value;
        }
        else if (type = "ytCategory") {
            extraYT.categories[extraYT.categories.length] = fromList[i].value.id;
        }
    }
}

// Update loop
var saveTimer = 0;
var callbacks = [];

function update() {
    if (windowIds.length != 0) {

        // Prevents icrementing multiple times in a single update
        var incrementedBlocksetIds = [];

        for (windowId of windowIds) {
            if (minimizedWindows.includes(windowId))
                continue;

            var tabId = openTabs[windowId];

            if (tabEvaluations[tabId] != undefined && tabEvaluations[tabId] != "safe") {
                var doBlock = false;

                var annoyBSIds = [];

                for (var bsId of tabEvaluations[tabId]) {
                    if (blocksetDatas[bsId] == undefined)
                        continue;

                    if (blocksetTimesElapsed[bsId] >= blocksetDatas[bsId].timeAllowed) { // Don't have time left
                        if (!blocksetDatas[bsId].annoyMode) {
                            doBlock = true;
                        }
                        else {
                            if (!annoyBSIds.includes(bsId))
                                annoyBSIds.push(bsId);

                            // Increment for annoy too
                            if (!incrementedBlocksetIds.includes(bsId)) {
                                incrementedBlocksetIds.push(bsId);
                                blocksetTimesElapsed[bsId] += UPDATE_INTERVAL;
                            }
                        }
                    }
                    else { // Have time left
                        if (!incrementedBlocksetIds.includes(bsId)) {
                            incrementedBlocksetIds.push(bsId);
                            blocksetTimesElapsed[bsId] += UPDATE_INTERVAL;
                        }
                    }
                }

                // One of more block sets want to block this tab
                if (doBlock) {
                    block(tabId);
                }

                // Push annoy notification only once per update for each tab
                if (annoyBSIds.length > 0) {
                    annoy(tabId, annoyBSIds);
                }

                setBadge(tabId);
            }
        }

        saveTimer += UPDATE_INTERVAL;

        if (saveTimer >= 10000) { // save every 10 seconds
            saveTimer = 0;
            saveElapsedTimes();
        }
        

        // Update popup and options page if they have registered their callbacks
        for (var callback of callbacks) {
            try {
                callback();
            }
            catch (e){}
        }
    }
}


// Tab and window listeners

var windowIds = [];

var minimizedWindows = [];

var openTabs = {}; //windowId as key, tabid array as value

var tabEvaluations = {}; // tabId as key

var allTabs = [];

chrome.tabs.onCreated.addListener(function (tab) {
    allTabs.push(tab.id);
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    delete tabEvaluations[tabId];

    index = allTabs.indexOf(tabId)
    if (index != -1)
        allTabs.splice(index, 1);
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    if (!windowIds.includes(activeInfo.windowId)) {
        windowIds.push(activeInfo.windowId);
        openTabs[activeInfo.windowId] = [];
    }
    if (!(Object.keys(tabEvaluations)).includes(activeInfo.tabId.toString())) {
        chrome.tabs.get(activeInfo.tabId, function (tab) {
            evaluateTab(tab);
        });
    }

    openTabs[activeInfo.windowId] = activeInfo.tabId;
});


chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        evaluateTab(tab);
    }
});

chrome.windows.onRemoved.addListener(function (windowId) {
    var index = windowIds.indexOf(windowId);
    if (index != -1) {
        windowIds.splice(index, 1);
    }
    index = minimizedWindows.indexOf(windowId);
    if (index != -1) {
        minimizedWindows.splice(index, 1);
    }

    delete openTabs[windowId]
});

chrome.windows.onFocusChanged.addListener(function (windowId) {
    if (windowId = -1) {
        chrome.windows.getAll(function (windowArray) {
            for (windowItem of windowArray) {
                var index = minimizedWindows.indexOf(windowItem.id);
                if (windowItem.state === "minimized" && index === -1) {
                    minimizedWindows.push(windowItem.id);
                }
                else if (index != -1){
                    minimizedWindows.splice(index, 1);
                }
            }
        });
    }
    else {
        var index = minimizedWindows.indexOf(windowId);
        if (index != -1) {
            minimizedWindows.splice(index, 1);
        }
    }
});


// Tab blocking evaluation
function evaluateTab(tab) {
    blockedBy(tab, function (blocksetIdList) {
        var url = tab.url.replace(/(^\w+:|^)\/\//, ''); //remove protocol
        if (blocksetIdList.length != 0) {
            //console.log("block: " + url + " id: " + blocksetIdList);
            tabEvaluations[tab.id] = blocksetIdList;
            setBadge(tab.id);
        }
        else {
            //console.log("safe: " + url);
            tabEvaluations[tab.id] = "safe";
            chrome.browserAction.setBadgeText({ text: "", tabId: tab.id });
        }
        chrome.tabs.get(tab.id, function (t) {
            if (t.active === true) {
                if (!windowIds.includes(t.windowId)) {
                    windowIds.push(t.windowId);
                    openTabs[t.windowId] = [];
                }
                openTabs[t.windowId] = t.id;
            }
        });
    });
}

var orange = [215, 134, 29, 255];
var red = [215, 41, 29, 255];
var grey = [123, 123, 123, 255];

function setBadge(tabId) {
    var time = getLowestTimeLeft(tabEvaluations[tabId]);

    var seconds = parseInt((time / 1000) % 60);
    var minutes = parseInt((time / (1000 * 60)) % 60);
    var hours = parseInt((time / (1000 * 60 * 60)) % 24);

    var color;
    var text = " ";
    if (time > 1000 * 60 * 60) { // time is more than one hour -> don't display time
        color = grey;
    }
    else if (time > 1000 * 60) { // time is more than one minute -> display time in minutes
        color = orange;
        text = (Math.floor(time / (1000 * 60))).toString();
    }
    else if (time >= 0) { // time is positive -> display time left in seconds
        color = red;
        text = (Math.floor(time / 1000)).toString();
    }
    else if (time < 0) {// annoy-mode is on
        color = red;
        text = "!!";
    }

    chrome.browserAction.setBadgeText({ text: text, tabId: tabId });
    chrome.browserAction.setBadgeBackgroundColor({ color: color, tabId: tabId });
}

function getLowestTimeLeft(blocksetIds) {
    var lowest = Infinity;
    for(id of blocksetIds) {
        if ((blocksetDatas[id].timeAllowed - blocksetTimesElapsed[id]) < lowest)
            lowest = (blocksetDatas[id].timeAllowed - blocksetTimesElapsed[id]);
    }
    return lowest;
}

function areYTListsEmpty() {
    for (var id of blocksetIds) {
        if (blYT[id].channels.length != 0 || blYT[id].categories.length != 0 || wlYT[id].channels.length != 0 || wlYT[id].categories.length != 0) {
            return false;
        }
    }
    return true;
}

function getStringBetween(source, a, b) {
    var iA = source.indexOf(a);
    if (iA === -1)
        return source;

    var iB = source.indexOf(b, iA);
    if (iB === -1)
        iB = source.length;

    return source.substring(iA + a.length, iB);
}

function blockedBy(tab, callback) {

    var blocksetIdList = [];

    var url = tab.url.replace(/(^\w+:|^)\/\//, ''); //remove protocol

    if (url.endsWith("blockPage.html")) {
        callback([]);
        return;
    }

    var now = timeToMsSinceMidnight(new Date());

    for (var id of blocksetIds) {

        if (!blocksetDatas[id].activeDays[currentWeekDay] || !isInActiveTime(now, id)) // if today is not an active day | or not in active hours
            continue;    

        if (!testRegEx(wlRegEx[id], url)) { // if not in whitelist
            if (testRegEx(blRegEx[id], url)) { // check blacklist
                blocksetIdList[blocksetIdList.length] = id;
            }
        }
    }

    if (url.startsWith("www.youtube.com/watch") && !areYTListsEmpty()) {
        var videoId = getStringBetween(url, "v=", "&");

        httpGetAsync("https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" + videoId + "&fields=items(snippet(categoryId%2CchannelId))&key=" + API_KEY, function (response) {
            var object = JSON.parse(response);
            if (object.items.length != 0) {
                var channelId = object.items[0].snippet.channelId;
                var categoryId = object.items[0].snippet.categoryId;

                for (var id of blocksetIds) {
                    if (!blocksetDatas[id].activeDays[currentWeekDay] || !isInActiveTime(now, id)) // if today is not an active day | or not in active hours
                        continue;

                    if (!wlYT[id].categories.includes(categoryId) && !wlYT[id].channels.some(c => c.id === channelId)) {
                        if (blYT[id].categories.includes(categoryId) || blYT[id].channels.some(c => c.id === channelId)) {
                            if (!blocksetIdList.includes(id)) {
                                blocksetIdList[blocksetIdList.length] = id;
                            }
                        }
                    }
                    else {
                        var index = blocksetIdList.indexOf(id);
                        if (index != -1) {
                            blocksetIdList.splice(index, 1);
                        }
                    }
                }
            }

            callback(blocksetIdList);
        });
    }
    else if (url.startsWith("www.youtube.com/channel/") && !areYTListsEmpty()) {
        var list = url.split("/");
        var channelId = list[2];

        evalChannelId(channelId, blocksetIdList);

        callback(blocksetIdList);
    }
    else if (url.startsWith("www.youtube.com/user/") && !areYTListsEmpty()) {
        var list = url.split("/");
        var userName = list[2];

        httpGetAsync("https://www.googleapis.com/youtube/v3/channels?part=snippet&forUsername=" + userName + "&fields=items%2Fid&key=" + API_KEY, function (response) {
            var object = JSON.parse(response);

            if (object.items.length != 0) {
                var channelId = object.items[0].id;
                evalChannelId(channelId, blocksetIdList);
            }

            callback(blocksetIdList);
        });
    }
    else if (url.startsWith("www.youtube.com/playlist") && !areYTListsEmpty()) {
        var playlistId = getStringBetween(url, "list=", "&");

        httpGetAsync("https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=" + playlistId + "&fields=items%2Fsnippet%2FchannelId&key=" + API_KEY, function (response) {
            var object = JSON.parse(response);
            if (object.items.length != 0) {
                var channelId = object.items[0].snippet.channelId;
                evalChannelId(channelId, blocksetIdList);
            }
            callback(blocksetIdList);
        });
    }
    else {
        callback(blocksetIdList);
    }
}

function evalChannelId(channelId, blocksetIdList) {
    var now = timeToMsSinceMidnight(new Date());
    for (var id of blocksetIds) {
        if (!blocksetDatas[id].activeDays[currentWeekDay] || !isInActiveTime(now, id)) // if today is not an active day | or not in active hours
            continue;

        if (!wlYT[id].channels.some(c => c.id === channelId)) {
            if (blYT[id].channels.some(c => c.id === channelId)) {
                if (!blocksetIdList.includes(id)) {
                    blocksetIdList[blocksetIdList.length] = id;
                }
            }
        }
        else {
            var index = blocksetIdList.indexOf(id);
            if (index != -1) {
                blocksetIdList.splice(index, 1);
            }
        }
    }
}

function isInActiveTime(timeNow, blocksetId) {
    var from = blocksetDatas[blocksetId].activeTime.from;
    var to = blocksetDatas[blocksetId].activeTime.to;

    if (from === to) {
        return true;
    }
    else if (from < to) {
        return (timeNow > from && timeNow < to);
    }
    else if (from > to) {
        return (timeNow > from || timeNow < to);
    }
}

function testRegEx(regExList, text) {
    for (var regEx of regExList) {
        if (regEx.test(text)) {
            return true;
        }
    }
    return false;
}

function block(tabId) {
    chrome.tabs.update(tabId, {
        url: "blockPage.html"
    });
}

function annoy(tabId, bsIds) {
    chrome.tabs.executeScript(tabId, {
        code: "typeof db_contentScriptCreated != 'undefined'"
    }, (created) => {
        if (chrome.runtime.lastError != undefined) {
            console.log(chrome.runtime.lastError.message);
            return;
        }
        
        var largestOverTime = 0;
        for (id of bsIds) {
            var t = blocksetTimesElapsed[id] - blocksetDatas[id].timeAllowed;
            if (t > largestOverTime) {
                largestOverTime = t;
            }
        }
        
        if (created[0]) {
            chrome.tabs.executeScript(tabId, { code: `db_showTime("${msToTimeDisplay(largestOverTime)}");` });
        }
        else {
            chrome.tabs.executeScript(tabId, {
                file: "libraries/jquery-3.2.1.min.js"
            }, () => {
                chrome.tabs.executeScript(tabId, {
                    file: "js/contentScript.js"
                }, () => {
                    chrome.tabs.insertCSS(tabId, { file: "styles/annoy.css" });
                    var time = msToTimeDisplay(blocksetDatas[bsIds[0]].timeAllowed - blocksetTimesElapsed[bsIds[0]]);
                    chrome.tabs.executeScript(tabId, { code: `db_showTime("${msToTimeDisplay(largestOverTime)}");` });
                });
            });
        }
    });
}

// janky solution to firefox dead object syndrome
function bsItem(type, value) {
    var item;
    if (type.startsWith("yt") == false) {
        item = {
            "type": type,
            "value": value
        }
    }
    else {
        item = {
            "type": type,
            "value": {
                "name": value[0],
                "id" : value[1]
            }
        }
    }
    return item;
}

// Saving
function save(blocksetId) {
    chrome.storage.sync.set({
          [blocksetId]: blocksetDatas[blocksetId]
    });
}

function saveAll() {
    var saveItems = {};
    for (id of blocksetIds) {
        saveItems[id] = blocksetDatas[id];
    }
    chrome.storage.sync.set(saveItems);

    //console.log("save");
}

function saveElapsedTimes() {
    chrome.storage.sync.set({
        blocksetTimesElapsed: blocksetTimesElapsed
    });
}


// HTTP get
function httpGetAsync(theUrl, callback) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function () {      
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
            callback(xmlHttp.responseText);
        }  
    }
    xmlHttp.open("GET", theUrl, true);
    xmlHttp.send(null);
}

//Donation
function openDonationPage() {
    chrome.tabs.create({ url: "https://paypal.me/eerolehtinen" }, function (tab) { });
}