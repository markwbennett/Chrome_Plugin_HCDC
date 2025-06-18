//---Creator: Eric M
//---Purpose: all javascript that enhances accessibility on our website can be called from this one script.

//---reusable on (any page)-------------------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------------------------------------------------

//HTML5 Validation assist.
//prevents user from entering a date past today's date.
function setMaxDt(Ctrl) {
    if (Ctrl) {
        let today = new Date();
        Ctrl.max = today.toISOString().split("T")[0];
    }
}

function setMaxYear(Ctrl) {
    if (Ctrl) {
        let today = new Date();
        Ctrl.max = today.getFullYear();
    }
}

//Use this for setting max date limit on setting date control in kiosk.aspx when the SQL is taken off of smalldatetime and the limit is increased.
//You can use this function in the year 2079. You're welcome from 2023 ⏲🧓
function setSuperMaxDt(Ctrl) {
    if (Ctrl) {
        let today = new Date();
        //the user can choose any setting date up to 100 years in the future from today.
        today.setFullYear(today.getFullYear() + 100);
        Ctrl.max = today.toISOString().split("T")[0];
    }
}

//have to use this becuase of smalldatetime SQL limitations
//SMALLDATETIME supports dates from 1900-01-01 through 2079-06-06
function setMaxDtKSetting(Ctrl) {

    let today = new Date();
    today.setFullYear(2079)
    today.setMonth(5);
    today.setUTCDate(6);
    Ctrl.max = today.toISOString().split("T")[0];

}


//prevents user from searching before our record keeping began officially(Jan 01, 1837)
function setMinDt(Ctrl) {
    if (Ctrl) {
        Ctrl.min = '1837-01-01';
    }
}

//Headerlogin.ascx function
function applyFaqFix() {
    let imgBtn = document.getElementById('btnFAQ');
    let frm = document.getElementById('aspnetForm');
    if (imgBtn) {
        imgBtn.addEventListener('focus', e => {
            frm.noValidate = true;
        });
        imgBtn.addEventListener('blur', e => {
            frm.noValidate = false;
        });

    }
}
//------------------------------------------------------------------------------------------------------------------------------------------------------
//--Code below is a HUGE win for html5 accessibility and validation controls. We can now use html5 without the login fields being blocked by other invalid fields.
//login event listeners, helps to allow html5 controls' validation/accessibility code to run without logic errors(interferes with login code)
let applyLoginEventListeners = function () {
    let unBox = document.getElementById('txtUserName');
    let pwBox = document.getElementById('txtPassword');

    if (unBox && pwBox) {
        addEventListeners(unBox);
        addEventListeners(pwBox);
    }
}

function addEventListeners(inputBox) {
    let loginBtn = document.getElementById('btnLogin');
    let frm = document.getElementById('aspnetForm');

    if (inputBox) {
        //turn off form validation when user is focused on login fields.
        inputBox.addEventListener('focus', (e) => {
            frm.noValidate = true;
        });
        //turn on form validation to true when user is not focused on login field.
        inputBox.addEventListener('blur', (e) => {
            frm.noValidate = false;
        });

        //when enter is pressed, supresse default behavior and manually click the login button.
        inputBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loginBtn.click();
            }
        });

    } else {
        frm.noValidate = false;
    }
}

//-----------------------------------------------------------------------------------------------------------------------------------------------------

/*Wcag.js function, Google creates input tags with no labels for their translate control. It creates a false positive in the f12 console, 
            so we add arialabel and a placeholder to resolve the error and tell anybody who might somehow focus it to disregard.*/
function fixGoogleErrors() {

    let ctrlIDs = ['goog-gt-votingInputSrcLang', 'goog-gt-votingInputTrgLang', 'goog-gt-votingInputSrcText', 'goog-gt-votingInputTrgText', 'goog-gt-votingInputVote','gmap_canvas'];

    for (var i = 0; i < ctrlIDs.length; i++) {
        var ele = document.getElementById(ctrlIDs[i]);
        if (ele) {
            ele.ariaLabel = 'System generated google tag, Disregard.';
            ele.placeholder = 'System generated google tag, Disregard.';
            ele.title = 'System generated google tag, Disregard.';
        }

    }

    //added to address the final f12 console error. 
    let gName = 'votingFrame';
    let voteEleArr = document.getElementsByName(gName);
    if (voteEleArr) {
        for (let i = 0; i < voteEleArr.length; i++) {
            if (voteEleArr[i]) {
                voteEleArr[i].setAttribute('title', 'System generated google tag, Disregard');
            }
        }
    }
}

// used to reset selected flags in a given collection of html elements
function resetAriaActive(clsName) {
    let elements = document.getElementsByClassName(clsName);
    if (elements) {
        for (let i = 0; i < elements.length; i++) {
            //statement below returns null/false if element doesn't have the aria'
            var hasAria = hasAttribute(elements[i], 'aria-selected');
            if (hasAria) {
                elements[i].attributes.removeNamedItem('aria-selected');
                elements[i].setAttribute('aria-selected', 'false')
            }
        }
    }
}

//determine if an element has an attribute)
//pass in an element and the name of the attribute you want to check for.
function hasAttribute(ele, attrName) {
    if (ele) {
        let hasAria = ele.attributes.getNamedItem(attrName);
        if (hasAria) {
            return true;
        } else {
            return false;
        }
    }
}

//general re-usable function for setting 'aria-selected' to true
function setAriaActive(eleID) {
    let ele = document.getElementById(eleID)
    //null check
    if (ele) {
        //remove any attribute value if it has one. Otherwise, just set the attribute.
        let hasAria = hasAttribute(ele, 'aria-selected');
        if (hasAria) {
            ele.removeAttribute('aria-selected');
            ele.setAttribute('aria-selected', 'true');
        } else {
            //there is no attrbute, go ahead and set it.
            ele.setAttribute('aria-selected', 'true');
        }
    }
}



// used to focus on an element, when called at the right time, helps screen readers tell sightless users what is happening on the page.
function focusElement(elementName) {

    var ele = document.getElementById(elementName);

    if (ele) {
        ele.setAttribute('tabindex', '0');
        ele.focus();
    }

}

//--used to set the aria-label so that screen reader users can understand the page better.
function setAriaLabel(eleName, msg) {
    var ele = document.getElementById(eleName);

    if (ele) {
        ele.setAttribute('aria-label', msg);
    }
}

//we can't control the way aspx renders it's Datagrid table, so we modify the table after it is rendered.
//accepts a collection of headers, assumes table structure. applies role=columnheader, which only works on <td>, <th> elements, etc.
function setTblHeaders(elements) {

    //for each header in the collection, set it's child controls roles
    for (let i = 0; i < elements.length; i++) {
        setChildRoles(elements[i]);
    }
}

//called in the above function to go deeper into header to assign the indidual <td>'s their roles. (role="columnheader")
function setChildRoles(header) {
    try {
        for (var x = 0; x < header.children.length; x++) {
            //grab each <td> element within the parent
            var tdEle = header.children[x];
            //assigns the property to the element. role='columnheader' helps sightless users understand the table by reading the header alongside the individual table data. (IE: the words  'case/cause #' are read aloud alongside the case #s.
            tdEle.setAttribute('role', 'columnheader');
        }
    } catch (err) {
        console.log('error in setChildRoles: \n' + err);
    }
}

//added because asp tags don't load aria-required property correctly.
//WCAG rule: color/text can't be the only indicator of a required field.
function addAriaRequired(elements) {
    /*var ctrls = document.getElementsByClassName('required');*/
    if (elements) {
        for (var i = 0; i < elements.length; i++) {
            elements.item(i).ariaRequired = true;
        }
    }

}

//used for aspx error tags that are not visible by default. in aspx visible=false causes the html dom object not to render, so the check below works.
function focusIfError(errElement) {

    if (errElement) {
        errElement.setAttribute('tabindex', '0');
        errElement.focus();
    }
}

//used to add extra information inside of labels that shouldn't be displayed on the page, but should be read to the user 
function addMarkup(element, markupToAdd) {
    if (element) {
        element.innerHTML = element.innerHTML + markupToAdd;
    }
}

//WCAG: used to pull any error tags that are visible="false" by default. We need to focus them if there is an error.
function checkForErrors() {

    //Ids of all error elements that may appear on page, if they appear we focus them. This can be updated to extend functionality. These are from Main.Master
    const errEleNames = ['errorDataList', 'lblError'];
    var isError = [];
    for (var i = 0; i < errEleNames.length; i++) {
        var ele = document.getElementById(errEleNames[i]);

        if (ele) {
            /*there is an error*/
            isError[i] = true;
            return isError;
        } else {
            /*there is no error*/
            isError[i] = false
        }
    }

    if (isError.indexOf(true) >= 0) {
        return true;
    } else {
        return false;
    }

}

/*pass in an array of ids, and check the page for the elements, if they are there, then remove their d-none class, which allows the parent element with role="alert" to read the message to screen reader users.*/
function showAlertMsg(arr) {

    for (var i = 0; i < arr.length; i++) {
        var ele = document.getElementById(arr[i]);
        if (ele) {
            ele.classList.remove('d-none');
        }
    }
}

function clickBtn(btnID) {

    var btn = document.getElementById(btnID);
    if (btn) {
        btn.click();
    }

}

//------------------------------------------------------------------------------------------------------------------------------------------------------
//---end reusable on (any page)---------------------------------------------------------------------------------------------------------------------









//---(AUDIO CAPTCHA 👂🔉) functions start. Currently called in: (CaseDetails.aspx, Registration.aspx)----------------------------------------------------
//-------------------------------------------------------------------------------------------------------------------------------------------------------------
function showAudioCaptcha() {
    try {

        /*controls used to load the audio captcha*/
        var hdnSRC = document.getElementById('hdnImgSRC');
        var ctrlSRC = document.getElementById('audioSRC');
        var audioBTN = document.getElementById('btnLoadAudio');
        var audioCTRL = document.getElementById('audioCtrl');


        /*audio captcha container, used for announcing changes to screen reader users*/
        var audioDiv = document.getElementById('audioAlertDiv');

        /*loads audio data url into the html control*/
        ctrlSRC.src = hdnSRC.value;
        hdnSRC.value = '';
        audioCTRL.load();

        /*remove buttons when user loads audio captcha, prevent spamming or duplicate requests.*/
        if (audioCTRL.classList.contains('d-none')) {
            audioCTRL.classList.remove('d-none');
            audioBTN.classList.add('d-none');
            audioDiv.removeAttribute('alert');
        }

        audioCTRL.focus();

    }
    catch (err) {
        console.log('error in showAudioCaptcha: \n' + err);
    }
}

//---(AUDIO CAPTCHA 👂🔉) functions end. Currently called in: (CaseDetails.aspx, Registration.aspx)------------------------------------------------------







//--------------------------------------------------------------------------------------------------------------------------------------------------------------










//---(Registration.aspx)® functions start-------------------------------------------------------
//------------------------------------------------------------------------------------------------

//page specific function, there are weird controls can't be accessed through class, get them through ID instead'
function addReqToWeirdEle() {

    //controls below can't be accessed through the class. access them through ID instead.
    var IdsToGet = ['areaCodeTextBox', 'chkAgree', 'middleTextBox', 'LastTextBox'];
    for (var i = 0; i < IdsToGet.length; i++) {
        var ele = document.getElementById(IdsToGet[i]);
        if (ele) {
            ele.ariaRequired = true;
        } else {
            console.log('error in adding required to special element: ' + ele);
        }

    }

}

//------------------------------------------------------------------------------------------------
//---(Registration.aspx)® functions end---------------------------------------------------------











//---(Search.aspx) 🔍 functions start--------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------------------------------------------

//---Dockets can be in the future, so we set their max date differently.
function setDtRngDockets() {
    let eles = document.getElementsByClassName('docketDates');
    for (let i = 0; i < eles.length; i++) {
        if (eles[i]) {
            setMinDt(eles[i]);
            //max date is todays date + 100 years
            setSuperMaxDt(eles[i]);
        }
    }
}

//---describes pager tables to user so they understand the fuction
function describeSearchPager() {
    var tbls = document.getElementsByClassName('PagerContainerTable');
    if (tbls) {
        for (var i = 0; i < tbls.length; i++) {
            createTblCaption(tbls[i], 'results pager');
        }
    }
}

function createTblCaption(tbl, msg) {
    if (tbl) {
        var caption = tbl.createCaption();
        caption.innerHTML = msg;
        caption.classList.add('visually-hidden');
    }
}


//apply wcag labels for 👨‍🦯 users on the notifications tables.
function captionSubTables() {
    //adds an aria-label to explain what each table is
    setAriaLabel('dgSubscriptions', 'Case Subscriptions');
    setAriaLabel('dgPartySubscriptions', 'Client/Party notifications');

    /*assign table headings their proper role*/
    setTblHeaders(document.getElementsByClassName('subscriptionHdr'));

}

//WCAG: function below is used to determine text the html will use to describe what tab the user is on.
//when the user selects a tab, the screen reader will say "(name of tab). selected" so the user knows what tab is currently selected.
function getActiveMsgSearch(tabName) {

    switch (tabName) {

        case 'tabCiv':
            return 'Cvil/Family tab, Selected.';
            break;
        case 'tabCrim':
            return 'Criminal tab, Selected.';
            break;
        case 'tabParty':
            return 'Party Inquiry tab, Selected.';
            break;
        case 'tabBack':
            return 'Background check tab, Selected';
            break;
        case 'tabHist':
            return 'Historical tab, Selected.'
            break;
        case 'tabVerd':
            return 'Trial Judgments tab, Selected';
            break;
        case 'tabSpec':
            return 'Special minutes tab, Selected.';
            break;
        case 'tabDoc':
            return 'Dockets tab, Selected.';
            break;
        case 'tabSubs':
            return 'Notifications tab, Selected.';
            break;
        default:
            return '';
            break;

    }

}

// sets aria-label to show an active message. Allows screen reader users to understand what the page is telling them.
function setAriaActiveSearch(tabID) {
    //reset all aria-selected before assigning the new tab the attribute
    //nav-item2 class indicates all tabs on search page
    var tabs = document.getElementsByClassName('nav-item2');
    setAriaForTabs(tabs);
    //the tab we want to focus on
    var tab = document.getElementById(tabID);

    var isError = checkForErrors();

    //null check, and make sure there is no error to display on page.
    if (tab && !isError) {

        //gets the message to tell user what tab is active.
        var msg = getActiveMsgSearch(tabID);
        tab.setAttribute('aria-label', msg);
        tab.focus();
    } else {
        // don't focus on element if there is a page error.
    }

}

//used to fix the announcement of tabs. They are described as links normally, this could confuse a sightless user.
function setAriaForTabs(elements) {
    for (let i = 0; i < elements.length; i++) {
        //Look for each tab ID, and apply the correct description to it.
        switch (elements[i].value) {

            case 'tabCiv':
                elements[i].ariaLabel = 'Civil/Family tab.';
                break;

            case 'tabCrim':
                elements[i].ariaLabel = 'Criminal tab.';
                break;

            case 'tabParty':
                elements[i].ariaLabel = 'Party Inquiry tab.';
                break;

            case 'tabBack':
                elements[i].ariaLabel = 'Background tab.';
                break;

            case 'tabHist':
                elements[i].ariaLabel = 'Historical tab.';
                break;

            case 'tabVerd':
                elements[i].ariaLabel = 'Trial Judgments tab.';
                break;

            case 'tabSpec':
                elements[i].ariaLabel = 'Special Minutes tab.';
                break;

            case 'tabDoc':
                elements[i].ariaLabel = 'Dockets tab.';
                break;

            case 'tabSubs':
                elements[i].ariaLabel = 'Notifications tab.';
                break;

        }

    }

}


//---(Search.aspx) functions end-----------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------------------------------------------


//---(hcdcnews.aspx) functions start-----------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------------------------------------------

function getActiveMsgNews(tabID) {

    switch (tabID) {
        case 'lnkNews':
            return 'news tab, selected.';
            break;
        case 'lnkPressReleases':
            return 'Press releases tab, selected.';
            break;
        case 'lnkCaseOfMonth':
            return 'case of the month tab, selected.';
            break;
        case 'lnkComNewsletter':
            return 'Community newsletter tab, selected.';
            break;
        case 'lnkContactUs':
            return 'Contact us tab, selected.';
            break;

    }

}

function setAriaActiveNews(tabID) {
    //reset all aria-selected before assigning the new tab the attribute
    //nav-item2 class indicates all tabs on search page
    resetAriaLabels(document.getElementsByClassName('newsTabs'));

    //the tab we want to focus
    var tab = document.getElementById(tabID);
    //check for errors
    var isError = checkForErrors();

    if (tab && !isError) {

        var msg = getActiveMsgNews(tabID);
        tab.setAttribute('aria-label', msg);
        tab.focus();

    }
}




//-----CaseDetails.aspx 🗃 specific functions begin-------------------------------------------------------------

/*adds aria-label to describe what tab is active CD=Case Details*/
function setActiveTabCD(tabID, className) {
    //resets all tabs to not active.
    resetAriaActive(className);
    //get the tab we want to activate
    var tab = document.getElementById(tabID);
    //if there is an error, stop processing.
    var isError = checkForErrors();
    
    if (tab && !isError) {
        /*var msg = getActiveMsgCD(tabID);*/
        //sets the currently active tab.
        tab.setAttribute('aria-selected', 'true');
        tab.focus();
    }
}

//-Function removed 11/07/23 because tab, tablist, and tabpanel roles are applied with aria-selected='true' or 'false' instead of having to manually set the custom messages below.
function getActiveMsgCD(tabID) {
    //This function removed, see comments above.
    switch (tabID) {

        case 'tabSummary':
            return 'Summary tab, selected.';
            break;

        case 'tabAppeals':
            return 'Appeals tab, selected.';
            break;

        case 'tabCrimAppeals':
            return 'Criminal appeals tab, selected.';
            break;

        case 'tabBonds':
            return 'Bonds tab, selected.';
            break;

        case 'tabActivities':
            return 'Activities tab, selected';
            break;

        case 'tabBookings':
            return 'Bookings tab, selected.';
            break;

        case 'tabCostStatement':
            return 'Cost Statement tab, selected.';
            break;

        case 'tabTransfers':
            return 'Transfers tab, selected.';
            break;

        case 'tabPostTrialWrits':
            return 'Post Trial Writs tab, selected.';
            break;

        case 'tabAbstracts':
            return 'Abstracts tab, selected.';
            break;

        case 'tabCrimHistory':
            return 'Criminal History tab, selected.';
            break;

        case 'tabWitness':
            return 'Witness tab, selected.';
            break;

        case 'tabParties':
            return 'Parties tab, selected.';
            break;

        case 'tabCourtCost':
            return 'Court Cost tab, selected.';
            break;

        case 'tabEvents':
            return 'Events tab, selected';
            break;

        case 'tabSettings':
            return 'Settings tab, selected.';
            break;

        case 'tabService':
            return 'Service tab, selected.';
            break;

        case 'tabCourtRegistry':
            return 'Court Registry tab, selected.';
            break;

        case 'tabChildSupport':
            return 'Child Support tab, selected.';
            break;

        case 'tabRelatedCases':
            return 'Related cases tab, selected.';
            break;

        case 'tabDefAlias':
            return 'Defendant Alias tab, selected.';
            break;

        case 'tabPayments':
            return 'Payments tab, selected.';
            break;

        case 'tabDocuments':
            return 'Documents tab, selected.';
            break;

        default:

            console.log('Error in getActiveMsgCD(), tab id not found: ' + tabID);

            break;


    }
}


/*shows message inside of a container with role="alert", when it's 'display: none' property is removed the parent container flags the screen reader program to read the text to the sightless user.*/
function revealMsg(ctnID) {
    var ctnID = document.getElementById(ctnID);

    if (ctnID) {
        ctnID.classList.remove('d-none');
    }
}

//used to determine which default sub tab needs to be active depending on what main tab is selected...
function getDefaultSubTab(activeMainTabID) {
    switch (activeMainTabID) {
        case 'tabService':
            return 'tabServices';
            break;

        case 'tabParties':
            return 'activePartiesTab';
            break;

        default:
            return '';
            break;

    } 


}


/*if there is an error label, send a flag */
function showAlertMsgCD() {
    var arr = getCDLabelIDArray();
    showAlertMsg(arr);
}

/*returns array of possible error IDs for the CaseDetails.aspx page*/
function getCDLabelIDArray() {

    const errLblIDS = ["lblSummaryError", "AppealsLabel", "lblCrimAppeals", "lblBonds", "lblActivities", "lblBookings", "lblHolds", "lblCostStatement",
        "lblTransfers", "lblPostTrialWrits", "lblAbstracts", "lblCrimHistory", "lblNoActiveParties", "lblNoInactiveParties", "lblCourtCost", "lblEvents", "lblSettingsLabel",
        "lblServiceLabel", "lblCourtRegistry", "lblChildSupport", "lblRelatedCases", "lblDefAlias", "lblPayments", "lblDocuments", "lblNoNotices"];

    return errLblIDS
}
function toggleRow(clientID) {
    //clientID is required because there could be any number of controls. ASPX generates sequential IDs on the repeater.
    let row = document.getElementById(clientID);
    //null check
    if (row) {
        //reveal or hide the 
        if (row.classList.contains('d-none')) {
            row.classList.remove('d-none');
        } else {
            row.classList.add('d-none');
        }
    }

}


//-----CaseDetails.aspx 🗃 specific functions End-------------------------------------------------------------



//-----Specific wcag error fix for the basket.aspx page and it's associated sub pages-------------------------------------------------------------

function removehiddenElements() {
    var eles = document.getElementsByClassName('rmvMe');

    for (let i = 0; i < eles.length; i++) {
        var ctrl = document.getElementById(eles[i]);
        if (ctrl) {
            ctrl.remove();
        }
    }
}

//---end basket.aspx calls

//----Shipping.aspx 📦 functions begin----------------------------------------

//---the 5 functions below are used to hide and show elements on the page so that sightless users can understand the page better.
function resetAllBoxes() {
    showEmailLnkTabIndex(false);
    showSnailMailBoxes(false);
    enableEmailBox(false);
    showFaxField(false);
}

function enableEmailBox(show) {
    var ele = document.getElementById('emailTextBox');
    if (ele) {
        if (show == true) {
            ele.removeAttribute('disabled');
        } else {
            ele.setAttribute('disabled', 'true');
        }
    }
}

function showFaxField(show) {
    var ele = document.getElementById('faxNumDiv')
    if (ele) {
        if (show == true) {
            if (ele.classList.contains('d-none')) {
                ele.classList.remove('d-none');
            }
        } else {
            ele.classList.add('d-none');
        }
    }
}

function showEmailLnkTabIndex(show) {
    var ele = document.getElementById('emailLinkCs');
    if (ele) {
        if (show == true) {
            ele.tabIndex = 0;
        } else {
            ele.tabIndex = -1;
        }
    }
}

function showSnailMailBoxes(show) {
    var box1 = document.getElementById('divsnailMail');
    var box2 = document.getElementById('divsnailMailCopies');
    if (box1 && box2) {
        if (show == true) {
            box1.style.display = 'inline';
            box2.style.display = 'inline';
        } else {
            box1.style.display = 'none';
            box2.style.display = 'none';
        }
    }
}
//----Shipping.aspx 📦 functions end----------------------------------------


//----Start Attorney kiosk.aspx ⚖ page-------------------------------------------------


//for most date controls on the kiosk page. 
//prevent user from entering a date before 01/01/1837 as that's when record keeping began. 📚
function setDtLimitsKiosk() {
    let dateEles = document.getElementsByClassName('date');
    for (let i = 0; i < dateEles.length; i++) {
        if (dateEles[i]) {
            //2 func below called from wcag.js
            setMaxDt(dateEles[i]);
            setMinDt(dateEles[i]);
        }
    }
}

//for the "Setting Date" field!!! It can be in the future so we set a more generous limit on it based on SQL size.
function setDtLimitsSetting() {
    let dateEles = document.getElementsByClassName('smlPastToday');
    for (let i = 0; i < dateEles.length; i++) {
        if (dateEles[i]) {
            //only set min date, no max for settings because they can be in the future.
            setMaxDtKSetting(dateEles[i]);
            setMinSmallDt(dateEles[i]);
        }
    }
}

//prevent user from entering date before 1900 or after today's date. 📅
//specifically for the filing tab 📁
function setDtLimitsSmall() {
    let dateEles = document.getElementsByClassName('smalldate');
    for (let i = 0; i < dateEles.length; i++) {
        if (dateEles[i]) {
            //2 func below called from wcag.js
            setMaxDt(dateEles[i]);
            setMinSmallDt(dateEles[i]);
        }
    }
}

//---minnimum date specifically needs to be 1900 because a value lower than this breaks the program's precious little heart. 💔
function setMinSmallDt(Ctrl) {
    if (Ctrl) {
        Ctrl.min = '1900-01-01';
    }
}

//need to toggle html visibility so that container role="alert" will read the notification to any sightless users.
let chkForErr = function () {
    let ele = document.getElementById('lblDocketNoRows');

    if (ele) {
        ele.classList.add('d-none');
        ele.classList.remove('d-none');
    }

}

//used to set the active tab when returning from postback.
function setPrevTab() {
    let prevTab = document.getElementById('hdnCurrentTab');

    if (prevTab) {
        let tabID = 'tab' + prevTab.value;
        setActiveTabK(tabID);
    }
}

function setActiveTabK(tabID) {
    resetKTabs();
    setKTabActive(tabID);
}

//reset kiosk tabs active css and aria-selected values
function resetKTabs() {
    let kioskTabs = document.getElementsByClassName('kioskTab');

    for (let y = 0; y < kioskTabs.length; y++) {
        if (kioskTabs[y].classList.contains('active')) {
            kioskTabs[y].classList.remove('active');
        }
        kioskTabs[y].attributes.getNamedItem('aria-selected').value = 'false';
    }
}

//set tab selected by it's ID and add active css class
function setKTabActive(tabID) {
    let tab = document.getElementById(tabID);
    if (tab) {
        tab.attributes.getNamedItem('aria-selected').value = 'true';
        tab.classList.add('active');
        tab.click();
    } else {
        let mainTab = document.getElementById('tabAtty');
        if (mainTab) {
            mainTab.classList.add('active')
            mainTab.click();
        }
    }
}



//----Code for the CivilParies.ascx control----------------------

function setAriaActiveCP(eleID) {
    resetAriaActive();
    let ele = document.getElementById(eleID);

    if (ele) {

        ele.attributes.getNamedItem('aria-selected').value = 'true'
    }

}

function resetAriaActiveCP() {
    let eles = document.getElementsByClassName('partiesLinks');
    if (eles.length > 0) {
        for (let i = 0; i < eles.length; i++) {
            eles[i].attributes.getNamedItem('aria-selected').value = 'false';
        }
    }
}



//---Code for the Images.ascx control-----------------------------------

function setAriaActiveIM(eleID) {
    resetAriaActiveIM();
    let ele = document.getElementById(eleID);

    if (ele) {

        ele.attributes.getNamedItem('aria-selected').value = 'true'
    }

}

function resetAriaActiveIM() {
    let eles = document.getElementsByClassName('imagesTabs');
    if (eles.length > 0) {
        for (let i = 0; i < eles.length; i++) {
            eles[i].attributes.getNamedItem('aria-selected').value = 'false';
        }
    }
}


//----End code for Attorney kiosk.aspx ⚖ page-------------------------------------------------


//---RequestNADocument.aspx start-------------------------------------------------------------------

//used to set max limit on the year controls.
function setYrLimits() {
    let ctrls = document.getElementsByClassName('year');
    for (let i = 0; i < ctrls.length; i++) {
        if (ctrls[i]) {
            setMaxYear(ctrls[i]);
        }
    }
}



//---RequestNADocument.aspx end-------------------------------------------------------------------