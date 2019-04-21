var filterLookUp = {
    "urlEquals": "url equals",
    "urlContains": "url contains",
    "urlPrefix": "url prefix",
    "urlSuffix": "url suffix",
    "ytChannel": "yt channel",
    "ytCategory": "yt category"
}

var bgPage;
var blocksetIds;
var blocksetDatas;
var blocksetTimesElapsed;

var generalOptions;

chrome.runtime.getBackgroundPage(function (bg) {
    // Store refernces to background script variables
    bgPage = bg;
    blocksetIds = bgPage.blocksetIds;
    blocksetDatas = bgPage.blocksetDatas;
    blocksetTimesElapsed = bgPage.blocksetTimesElapsed;
    generalOptions = bgPage.generalOptions;
    init();
});

var currentPageId;

function init() {
    //If background script hasn't received save data yet, then wait
    if (bgPage.initDone === false) {
        setTimeout(init, 100);
        console.warn("connection failed with background script, trying again...");
        return;
    }

    loadTimePickers();
    displayHelp(generalOptions.displayHelp);
    setDarkTheme(generalOptions.darkTheme);
    displayPage(-1);

    displayBlocksetNavs();

    bgPage.callbacks[0] = update; // Register for updates from background script

    setupJQueryUI();

    $('.timepicker#timeAllowed').timepicker({
        timeFormat: 'HH:mm:ss',
        dynamic: false,
        dropdown: false,
        scrollbar: false,
        change: function (time) {
            var timeMs = dateToMs(time);
            if (currentPageId >= 0 && blocksetDatas[currentPageId].timeAllowed != timeMs && oldTime != timeMs) {
                oldTime = timeMs;
                if (blocksetDatas[currentPageId].timeAllowed < timeMs) {
                    var pageId = currentPageId;
                    dialog("Do you want more time to waste?", "Are you really sure you want to slack off even more? It most likely isn't healthy.",
                        "Yes", function () {
                            setTimeAllowed(timeMs, pageId);
                        }, "Not Really", function () {
                            if (pageId === currentPageId) {
                                $(".timepicker#timeAllowed").timepicker("setTime", msToDate(blocksetDatas[pageId].timeAllowed));
                                oldTime = blocksetDatas[pageId].timeAllowed;
                            }
                        });
                }
                else {
                    setTimeAllowed(timeMs, currentPageId);
                }
            }
        }
    });

    if (navigator.userAgent.toLowerCase().indexOf('firefox') === -1)
        $("hr.border").hide();
}

var oldTime = -1;

function setTimeAllowed(value, pageId) {
    blocksetDatas[pageId].timeAllowed = value;
    $("#timeLeft").text(msToTimeDisplay(blocksetDatas[pageId].timeAllowed - blocksetTimesElapsed[pageId]));
    saveCurrentBlockset();
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "blocksetChanged") {
        if (currentPageId === message.id) {
            displaySites(blocksetDatas[message.id].blacklist, "bl");
            displaySites(blocksetDatas[message.id].whitelist, "wl");
        }
    }
});

function update() {
    if (currentPageId >= 0) {
        setTimeDisplay($("#timeLeft"), blocksetDatas[currentPageId].timeAllowed - blocksetTimesElapsed[currentPageId]);
        if (!inputsRestricted && blocksetTimesElapsed[currentPageId] >= blocksetDatas[currentPageId].timeAllowed 
            && blocksetDatas[currentPageId].timeAllowed != 0 && !blocksetDatas[currentPageId].annoyMode) {
            restrictInputs(true);
        }
        if (inputsRestricted)
            $("#timeLeftSuffix").text(" (some inputs restricted)");
        else 
            $("#timeLeftSuffix").text("");
    }
}

function loadTimePickers() {         
    if ($('.timepicker#resetTime').timepicker != undefined) {
        $('.timepicker#resetTime').timepicker("destroy");
    }

    $('.timepicker#resetTime').timepicker({
        timeFormat: generalOptions.clockType === 24 ? 'HH:mm' : "hh:mm p",
        defaultTime: 0, dynamic: false, dropdown: false, scrollbar: false,
        change: function (time) {
            var ms = dateToMs(time);
            if (currentPageId >= 0 && blocksetDatas[currentPageId].resetTime != ms) {
                blocksetDatas[currentPageId].resetTime = ms;
                saveCurrentBlockset();
            }
        }
    });

    if ($('.timepicker#activeFrom').timepicker != undefined) {
        $('.timepicker#activeFrom').timepicker("destroy");
    }

    $('.timepicker#activeFrom').timepicker({
        timeFormat: generalOptions.clockType === 24 ? 'HH:mm' : "hh:mm p",
        defaultTime: 0, dynamic: false, dropdown: false, scrollbar: false,
        change: function (time) {
            var ms = dateToMs(time);
            if (currentPageId >= 0 && ms != blocksetDatas[currentPageId].activeTime.from) {
                blocksetDatas[currentPageId].activeTime.from = ms;
                saveCurrentBlockset();
            }
        }
    });

    if ($('.timepicker#activeTo').timepicker != undefined) {
        $('.timepicker#activeTo').timepicker("destroy");
    }

    $('.timepicker#activeTo').timepicker({
        timeFormat: generalOptions.clockType === 24 ? 'HH:mm' : "hh:mm p",
        defaultTime: 0, dynamic: false, dropdown: false, scrollbar: false,
        change: function (time) {
            var ms = dateToMs(time);
            if (currentPageId >= 0 && ms != blocksetDatas[currentPageId].activeTime.to) {
                blocksetDatas[currentPageId].activeTime.to = ms;
                saveCurrentBlockset();
            }
        }
    });
}

function setupJQueryUI() {
    $("ul.nav").sortable({
        axis: "y",
        items: "> li[list='blocksets']",
        update: function (event, ui) {
            var newBlocksetIds = [];
            var listItems = $("ul.nav > li[list='blocksets']");
            listItems.each(function (i) {
                newBlocksetIds[i] = parseInt($(this).find("a").attr("id"));
                blocksetIds = newBlocksetIds;
                chrome.storage.sync.set({
                    blocksetIds: blocksetIds
                });
            });
        },

        start: function (event, ui) {
            if (ui.item.find("a").attr("class") != "selected")
                ui.item.find("a").attr("class", "drag");
        },
        stop: function (event, ui) {
            if (ui.item.find("a").attr("class") != "selected") {
                ui.item.find("a").removeAttr("class");
            }

            if (Math.abs(ui.offset.top - ui.originalPosition.top) <= 12) { // probable accidental drag
                displayPage(ui.item.find("a").attr("id"));
            }
        }
        
    });
}

function displayBlocksetNavs() {
    $("li.blocksetNav").remove();
    
    for (var i = 0; i < blocksetIds.length; i++) {

        blocksetLink = displayBlocksetNav(blocksetIds[i])
        blocksetLink.click(function () {
            displayPage($(this).attr("id"))
        });
    }

    if (blocksetIds.length < 50) {
        var listItem = $("<li>", { class: "blocksetNav" }).appendTo("ul.nav");
        var addBlocksetLink = $("<a>").css({ "fontSize": "20px", "padding": "0px 16px 5px 16px", "font-weight": "500" }).attr({ href: "#", class: "blocksetLink" }).append("+");
        addBlocksetLink.appendTo(listItem);

        addBlocksetLink.click(function () {
            if (blocksetIds.length < 50)
                displayPage(addBlockset());
        });
    }
}

function displayBlocksetNav(id) {
    var listItem = $("<li>", { class: "blocksetNav", list: "blocksets"}).appendTo("ul.nav");
    var blocksetLink = $("<a>", { href: "#", id: id }).append(blocksetDatas[id].name);
    blocksetLink.appendTo(listItem);
    return blocksetLink;
}

//general id=-1, deselect= -10
function displayPage(id) {
    $("#" + currentPageId).removeAttr("class");
    $("#" + id).attr({ class: "selected" });

    currentPageId = id;

    $("ul.blockset").hide();
    $("ul.general").hide();
    $(".donate").hide();

    if (id >= 0) {
        $("ul.blockset").show();

        $("input.blocksetRename").hide();
        $("#name").show();

        $("#name").html(blocksetDatas[id].name);

        $("#annoyMode").prop("checked", blocksetDatas[id].annoyMode);
        $(".timepicker#resetTime").timepicker("setTime", msToDate(blocksetDatas[id].resetTime));
        $(".timepicker#timeAllowed").timepicker("setTime", msToDate(blocksetDatas[id].timeAllowed));
        oldTime = -1;
        $(".timepicker#activeFrom").timepicker("setTime", msToDate(blocksetDatas[id].activeTime.from));
        $(".timepicker#activeTo").timepicker("setTime", msToDate(blocksetDatas[id].activeTime.to));
        setTimeDisplay($("#timeLeft"), blocksetDatas[id].timeAllowed - blocksetTimesElapsed[id]);
        for (var i = 0; i < 7; i++) {
            $("#aDay" + i).prop("checked", blocksetDatas[id].activeDays[i]);
        }
        
        $("#blSiteItems").empty();
        $("#wlSiteItems").empty();

        displaySites(blocksetDatas[id].blacklist, "bl");
        displaySites(blocksetDatas[id].whitelist, "wl");

        if (blocksetTimesElapsed[id] >= blocksetDatas[id].timeAllowed && blocksetDatas[id].timeAllowed != 0 && !blocksetDatas[id].annoyMode) {
            restrictInputs(true);
            $("#timeLeftSuffix").text(" (some inputs restricted)");
        }
        else {
            restrictInputs(false);
            $("#timeLeftSuffix").text("");
        }
    }
    else if (id === -1) {
        $("ul.general").show();

        $("input[type=radio][name=clockType][value=" + generalOptions.clockType + "]").prop("checked", true);
        $("#displayHelp").prop("checked", generalOptions.displayHelp);
        $("#darkTheme").prop("checked", generalOptions.darkTheme);
    }
    else if (id === -2) {
        $(".donate").show();
    }
    else if (id === -10) {
        // Deselect
    }
}

var inputsRestricted = false;
function restrictInputs(toState) {
    inputsRestricted = toState;
    $("#annoyMode, #resetTime, #timeAllowed, #activeFrom, #activeTo, input[id^='aDay'], #whitelistSelect, #whitelistInput, #whitelistAdd, li.siteItem[id^='bl'] > button[name=deleteSite], #delete").prop("disabled", toState);
    $("input[id^= 'aDay']").each(function (index) { // make aDay labels grey with class "disabled"
        if (toState === true)
            $(this).parent().attr("class", "disabled");
        else
            $(this).parent().removeAttr("class");
    });
}

function displaySites(list, type) {
    if (type === "bl") {
        $("#blSiteItems").empty();
    }
    else if (type === "wl") {
        $("#wlSiteItems").empty();
    }
    for (var i = 0; i < list.length; i++) {
        var siteValue = list[i].value;
        if (list[i].type === "ytChannel" || list[i].type === "ytCategory") {
            siteValue = list[i].value.name + " <span style='color:grey'>" + list[i].value.id + "</span>";
        }
        var siteItem = $("<li>", { class: "siteItem", id: type + "Item" + i }).prependTo("#" + type + "SiteItems");
        $("<span>", { class: "filter" }).html(filterLookUp[list[i].type] + ":").appendTo(siteItem);
        $("<span>", { class: "site" }).html(siteValue).appendTo(siteItem);
        var button = $("<button>", { class: "close" , name: "deleteSite"}).html("<img src='images/cancel.png'>").appendTo(siteItem);
        if (type === "bl" && inputsRestricted)
            button.prop("disabled", true);
        button.on("click", function () {
            removeSite(type, $(this));
        });
    }
}

function addSite(toList, select, input, callback) {
    if (select.val() === "ytChannel") {
        bgPage.httpGetAsync("https://www.googleapis.com/youtube/v3/channels?part=snippet&id=" + input.val() + "&fields=items(id%2Csnippet%2Ftitle)&key=" + bgPage.APIkey, function (response) {
            var object = JSON.parse(response);
            if (object.items.length != 0) {
                toList[toList.length] = bgPage.bsItem(select.val(), [object.items[0].snippet.title, object.items[0].id]);
                callback();
            }
            else {
                dialog("Error", "This channel doesn't exist, faulty id: " + input.val(), "OK");
            }
        });
    }
    else if (select.val() === "ytCategory") {
        if (bgPage.ytCategoryNamesById[input.val()] != undefined) {
            toList[toList.length] = bgPage.bsItem(select.val(), [bgPage.ytCategoryNamesById[input.val()], input.val()]);
            callback();
        }
        else {
            dialog("Error", "This category id doesn't exist, faulty id: " + input.val() + "<br> <a href='#' name='allCategories'>list of all categories by their ids</a>", "OK");
        }
    }
    else {
        toList[toList.length] = bgPage.bsItem(select.val(), input.val());
        callback();
    }
}

function removeSite(type, button) {
    $("#" + type + "SiteItems").empty();
    var list = type === "bl" ? blocksetDatas[currentPageId].blacklist : blocksetDatas[currentPageId].whitelist;
    list.splice(button.parent().attr("id").charAt(6), 1);
    displaySites(list, type);
    saveCurrentBlockset();
}

function addBlockset(newData) {
    var newBlocksetId = findNewBlocksetId();
    blocksetIds[blocksetIds.length] = newBlocksetId;

    chrome.storage.sync.set({
        blocksetIds: blocksetIds
    });
    
    if (newData != undefined) {
        blocksetDatas[newBlocksetId] = newData;
        addAbsentItems(blocksetDatas[newBlocksetId], bgPage.defaultBlockset());
    }
    else {
        blocksetDatas[newBlocksetId] = bgPage.defaultBlockset();
        blocksetDatas[newBlocksetId].name = getNewBlocksetName();
    }

    chrome.storage.sync.set({
        [newBlocksetId]: blocksetDatas[newBlocksetId]
    });

    displayBlocksetNavs();

    if (blocksetIds.length >= 50) {
        dialog("Block set maximum reached", "You have reached the maximum of 50 block sets. Consider combining their rules.", "OK");
    }

    chrome.runtime.sendMessage({
        type: "blocksetChanged",
        id: newBlocksetId
    });

    return newBlocksetId;
}


function getNewBlocksetName(copyName) {
    var newName = "Block set 0";

    if (copyName != undefined)
        newName = copyName + "(0)";
    
    var currentNum = 0;

    var duplicate = true; // Assume to be duplicate until proven otherwise

    while (duplicate) {
        duplicate = hasDuplicateBSName(newName);
        if (duplicate) {
            currentNum++;

            if (copyName != undefined) {
                newName = copyName + "(" + currentNum + ")";
            }
            else {
                newName = "Block set " + currentNum;
            }
        }
    }

    return newName;
}

function hasDuplicateBSName(name) {
    for (var bsId of blocksetIds) {
        if (name == blocksetDatas[bsId].name) {
            return true;
        }
    }
    return false;
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

function deleteBlockset(id) {
    if (blocksetDatas[id] === undefined)
        return;

    delete blocksetDatas[id];

    chrome.storage.sync.remove(id.toString());

    blocksetIds.splice(blocksetIds.indexOf(parseInt(id, 10)), 1);

    chrome.storage.sync.set({
        blocksetIds: blocksetIds
    });

    displayBlocksetNavs();

    if (blocksetIds.length === 0)
        displayPage(-1);
    else 
        displayPage(blocksetIds[blocksetIds.length - 1]);
    
    chrome.runtime.sendMessage({
        type: "blocksetDeleted",
        id: id
    });

}

function findNewBlocksetId() {
    i = 0;
    while (i < blocksetIds.length) {
        if (!blocksetIds.includes(i)) {
            return i;
        }
        i++;
    }
    return i;
}

function saveCurrentBlockset() {
    chrome.storage.sync.set({
          [currentPageId]: blocksetDatas[currentPageId]
    }, function () {
        if (chrome.runtime.lastError == null) {
            $("#saveIndicator").addClass("show");
            setTimeout(() => {$("#saveIndicator").removeClass("show")}, 100);
        }
        else {
            console.log(chrome.runtime.lastError);
        }
    });

    chrome.runtime.sendMessage({
        type: "blocksetChanged",
        id: currentPageId
    });
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

function msToDate(ms) {
    var h = parseInt((ms / (1000 * 60 * 60)) % 24);
    var m = parseInt((ms / (1000 * 60)) % 60);
    var s = parseInt((ms / 1000) % 60);
    var date = new Date(0);
    date.setHours(h, m, s);
    return date;
}

function dateToMs(time) {
    return (time.getSeconds() * 1000) + (time.getMinutes() * 60000) + (time.getHours() * 3600000);
}

// Update dom element text to time in ms
function setTimeDisplay(element, time) {
    element.text(msToTimeDisplay(time));

    if (time < 0) {
        if (!element.hasClass("red")){
            element.addClass("red");
        }
    }
    else {
        if (element.hasClass("red")){
            element.removeClass("red");
        }
    }
}

function dialog(title, text, acceptText, onAccept, declineText, onDecline) {
    var dWindow = $("<div>", { class: "dialog" }).appendTo($("body"));
    var topBar = $("<div>", { class: "topBar" }).appendTo(dWindow);
    var title = $("<span>").html(title).appendTo(topBar);
    
    var textBox = $("<div>", { class: "text" }).html(text).appendTo(dWindow);
    var botBar = $("<div>", { class: "botBar" }).appendTo(dWindow);
    var decline;
    if (declineText != undefined)
        decline = $("<button>").html(declineText).appendTo(botBar);
    var accept = $("<button>").html(acceptText).appendTo(botBar);

    if (declineText != undefined) {
        decline.on("click", function () {
            if (onDecline != undefined)
                onDecline();
            dWindow.remove();
        });
    }

    accept.on("click", function () {
        if (onAccept != undefined)
            onAccept();
        dWindow.remove();
    });

    dWindow.draggable({ handle: topBar, scroll: false });

    dWindow.css("margin-top", -(dWindow.height() / 2) + "px");

    var link = textBox.find("a");
    if (link != undefined) {
        if (link.attr("name") === "allCategories") {
            link.on("click", function () { listAllCategories(); });
        }
        if (link.attr("name") === "ytAdding") {
            link.on("click", function () { dialog("Adding YouTube channels/categories", $("div#help_ytAdding").html(), "OK") });
        }
    }

    return dWindow;
}

function listAllCategories() {
    var textBox = $("<div>");
    var table = $("<table>").html("<tr> <td></td> <td></td> </tr>");
    table.appendTo(textBox);

    var leftList = $("<ul>");
    leftList.appendTo(table.find("td:first"));
    var rightList = $("<ul>");
    rightList.appendTo(table.find("td:last"));

    var keys = Object.keys(bgPage.ytCategoryNamesById);
    var halfLength = Math.ceil(keys.length / 2);

    for (var i = 0; i < keys.length; i++) {
        var toList = (i < halfLength) ? leftList : rightList;
        $("<li>").text(keys[i] + ": " + bgPage.ytCategoryNamesById[keys[i]]).appendTo(toList);
    }
    
    dialog("Categories by id", textBox.html(), "OK");
}

function displayHelp(bool) {
    if (bool === true)
        $("button[id^=help_]").show();
    else
        $("button[id^=help_]").hide();
}

function setDarkTheme(bool) {
    generalOptions.darkTheme = bool;
    if (bool === true)
        $("html").attr({class: "dark"});
    else
        $("html").removeAttr("class");
}

function diskDownloadData() {

    var savesJson = {
        blocksetDatas: blocksetDatas,
        generalOptions: generalOptions
    }

    var blob = new Blob([JSON.stringify(savesJson)], { type: "application/json;charset=utf-8" });
    saveAs(blob, "Dawdle_block_save_" + (new Date).toLocaleDateString() + ".json");
}

function diskLoadData(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
        var saves = JSON.parse(e.target.result);
        var feedback = "Save file loaded";
        if (saves.blocksetDatas != undefined) {
            keys = Object.keys(saves.blocksetDatas);
            for(key of keys) {
                if (blocksetIds.length < 50) {
                    addBlockset(saves.blocksetDatas[key]);
                }
            }
            saveAllBlocksets();
        }
        else {
            feedback += " (no block sets found)";
        }
        if (saves.generalOptions != undefined) {
            generalOptions = saves.generalOptions;
            saveGeneralOptions();
        }
        else {
            feedback += " (no general options found)";
        }
        displayBlocksetNavs();
        displayPage(currentPageId);
        $("#fileIndicator").text(feedback).show().fadeOut(3000);
    };

    reader.readAsText(file);
}

function saveAllBlocksets() {
    for (id of blocksetIds) {
        chrome.storage.sync.set({
          [id]: blocksetDatas[id]
        });

        chrome.runtime.sendMessage({
            type: "blocksetChanged",
            id: id
        });
    }
}

function saveGeneralOptions() {
    chrome.storage.sync.set({
        generalOptions: generalOptions
    }, function () {
        if (chrome.runtime.lastError == null) {
            $("#generalSaveIndicator").addClass("show");
            setTimeout(() => { $("#generalSaveIndicator").removeClass("show") }, 100);
        }
        else {
            console.log(chrome.runtime.lastError);
        }
    });

    chrome.runtime.sendMessage({
        type: "generalOptionsChanged"
    });
}


$("button#donate").click(function () {
    chrome.runtime.sendMessage({
        type: "donate"
    });
});

$("#-2").click(function () {
    displayPage(-2);
});

$("#-1").click(function () {
    displayPage(-1);
});

//---Blockset---

var deleteDialog;
$("#delete").on("click", function () {
    var page = currentPageId;
    if (deleteDialog != undefined) {
        deleteDialog.remove();
        deleteDialog = undefined;
    }

    deleteDialog = dialog("Delete block set: " + blocksetDatas[page].name, "This block set will be deleted permanently. Are you sure?", "Delete", function () {
        deleteBlockset(page);
    }, "Cancel", undefined);
});

$("#duplicate").on("click", function () {
    var newData = JSON.parse(JSON.stringify(blocksetDatas[currentPageId])); // deep copy
    newData.name = getNewBlocksetName(newData.name);
    addBlockset(newData);
    displayPage(currentPageId);
});

$("#rename").on("click", function () {
    $("div.main").scrollTop(0);
    $("#name").hide();
    $("input.blocksetRename").val(blocksetDatas[currentPageId].name);
    $("input.blocksetRename").show().focus();
});

$("input.blocksetRename").on("blur keypress", function (e) {
    if (e.originalEvent.type === "blur" || (e.originalEvent.type === "keypress" && e.originalEvent.key === "Enter")) {
        var newName = $("input.blocksetRename").val();
        if (newName != "") {
            blocksetDatas[currentPageId].name = newName;
            saveCurrentBlockset();
            $("input.blocksetRename").val("");
            $("input.blocksetRename").hide();
            $("#name").show();
            displayBlocksetNavs();
            displayPage(currentPageId);
        }
    }
});

$("#blacklistAdd").on("click", blacklistAddSite);
$("#blacklistInput").on("keypress", function (event) {
    if (event.originalEvent.key === "Enter")
        blacklistAddSite();
});

function blacklistAddSite() {
    if ($("#blacklistInput").val() != "") {
        addSite(blocksetDatas[currentPageId].blacklist, $("#blacklistSelect"), $("#blacklistInput"), function () {
            $("#blacklistInput").val("");
            saveCurrentBlockset();
            displaySites(blocksetDatas[currentPageId].blacklist, "bl");
        });
    }
}

$("#whitelistAdd").on("click", whitelistAddSite);
$("#whitelistInput").on("keypress", function (event) {
    if (event.originalEvent.key === "Enter")
        whitelistAddSite();
});

function whitelistAddSite() {
    if ($("#whitelistInput").val() != "") {
        addSite(blocksetDatas[currentPageId].whitelist, $("#whitelistSelect"), $("#whitelistInput"), function () {
            $("#whitelistInput").val("");
            saveCurrentBlockset();
            displaySites(blocksetDatas[currentPageId].whitelist, "wl");
        });
    }
}

$("input[id^=aDay]").on("change", function () {
    for (var i = 0; i < 7; i++) {
        blocksetDatas[currentPageId].activeDays[i] = $("#aDay" + i).prop("checked");
    }
    saveCurrentBlockset();
});

$("#annoyMode").on("change", function () {
    var checkBox = $(this);
    if (checkBox.prop("checked")) {
        chrome.permissions.contains({
            origins: ["<all_urls>"]
        }, (res) =>  {
            if (res) {
                blocksetDatas[currentPageId].annoyMode = true;
                saveCurrentBlockset();
            }
            else {
                var textObj = $("#help_annoyMode_permission_text");
                dialog(textObj.attr("header"), textObj.html(), "Continue", () => {
                    // On continue
                    chrome.permissions.request({
                        origins: ["<all_urls>"]
                    }, (granted) => {
                        if (granted) {
                            blocksetDatas[currentPageId].annoyMode = true;
                            saveCurrentBlockset();
                        } else {
                            checkBox.prop("checked", false);
                        }
                    });
                }, "Cancel", () => {
                    // On cancel
                    checkBox.prop("checked", false);
                });
            }
        });
    }
    else {
        blocksetDatas[currentPageId].annoyMode = false;
        saveCurrentBlockset();
    }
});

//---General options---

$("input[type=radio][name=clockType]").on("change", function () {
    generalOptions.clockType = parseInt($(this).val());
    saveGeneralOptions();
    loadTimePickers();
});

$("#displayHelp").on("change", function () {
    generalOptions.displayHelp = $(this).prop("checked");
    displayHelp(generalOptions.displayHelp);
    saveGeneralOptions();
});

$("#darkTheme").on("change", function () {
    generalOptions.darkTheme = $(this).prop("checked");
    setDarkTheme(generalOptions.darkTheme);
    saveGeneralOptions();
});

$("#whitelistSelect").on("change", function () {
    var input = $("#whitelistInput");
    if ($(this).val().startsWith("url")) {
        input.attr("placeholder", "e.g. www.youtube.com/watch?v=useful_video");
    }
    else if ($(this).val() === "ytChannel") {
        input.attr("placeholder", "e.g. UC2C_jShtL725hvbm1arSV9w");
    }
    else if ($(this).val() === "ytCategory") {
        input.attr("placeholder", "e.g. 10");
    }
    input.focus();
});

$("#blacklistSelect").on("change", function () {
    var input = $("#blacklistInput");
    if ($(this).val().startsWith("url")) {
        input.attr("placeholder", "e.g. www.youtube.com");
    }
    else if ($(this).val() === "ytChannel") {
        input.attr("placeholder", "e.g. UC2C_jShtL725hvbm1arSV9w");
    }
    else if ($(this).val() === "ytCategory") {
        input.attr("placeholder", "e.g. 24");
    }
    input.focus();
});

$("button.help").on("click", function () {
    var text = $("#" + $(this).attr("id") + "_text");
    dialog(text.attr("header"), text.html(), "OK");
});

$("button#export").on("click", function () {
    diskDownloadData();
});

$("input#chooseFileHidden").on("change", function () {
    if ($(this).prop("files")[0] === undefined) {
        $("button#import").prop("disabled", true);
        $("span#chooseFileLabel").text("No file chosen");
    }       
    else {
        $("button#import").prop("disabled", false);
        $("span#chooseFileLabel").text($(this).prop("files")[0].name);
    }
});

$("button#chooseFile").on("click", function () {
    $("input#chooseFileHidden").click();
});

$("button#import").on("click", function () {
    diskLoadData($("input#chooseFileHidden").prop("files")[0]);
});