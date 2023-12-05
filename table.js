"use strict";
/**
 * @author Passific https://github.com/Passific/Poker-Planning
 */

const CURRENT_VERSION = "0.5";

const API_URL = "api.php?a=";

const THRESHOLD_IN_FOCUS    = 1;
const THRESHOLD_OUT_FOCUS   = 3;
const THRESHOLD_NOT_VISIBLE = 30;
const DEFAULT_TIMEOUT       = 60;

const SPACER_CARD = "!spacer!";
const CARD_SUITES = {
    "fibonacci2" : [0, 1, 2, 3, 5, 8, 13, 20, 40, 100, SPACER_CARD, "coffee", "infinite", "question"],
    "confidence" : [1, 2, 3, 4, 5],
    "scale" : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
}
const DEFAULT_SUITE = "fibonacci2"; // "fibonacci2" or "confidence"

let state     = "name";
let theme     = "basic";
let theme_ext = "svg";
let counter   = 10;
let inFocus   = true;
let threshold = 1;
const select = document.getElementById("poker-select");
const selectSuite = document.getElementById("select-suite");
const review = document.getElementById("poker-review");
const result = document.getElementById("poker-result");
const reset  = document.getElementById("reset");
const reveal = document.getElementById("reveal");
const anonymousEl = document.getElementById("anonymous");
const nameEl = document.getElementById("name");
const countdownEl  = document.getElementById("countdown");
let timerCountdown = null;
let timeOutSelect  = false;

/**
 * Fetch from API server.
 * @param {string} url - path to fetch on API server.
 * @returns {Object} fetched data
 */
function api_fetch (url)
{
    return fetch(API_URL + url).then((response) => {
        if (200 != response.status) {
            return Promise.reject(new Error("api_fetch "+url+" response.status="+response.status));
        }
        return response.json();
    });
}

/**
 * Get parameter value from url
 * @param {string} name - Parameter name.
 * @returns {string} Parameter value or empty string if not found.
 */
function getParameterByName (name)
{
    return new URLSearchParams(window.location.search).get(name);
}

/**
 * Generate a countdown display.
 * @param {number} time - Time in seconds.
 * @returns {string}. String representing the DOM element to display.
 */
function countDown (time)
{
    return "Remaining time: " + time;
}

function ask_timeout ()
{
    return api_fetch("timeout&t="+tableId+"&v="+this.value);
}

/**
 * Stop the countdown timer (if any).
 * @returns {void}.
 */
function stopCountDown ()
{
    if (null !== timerCountdown) {
        clearInterval(timerCountdown);
        timerCountdown = null;
    }
    if (!timeOutSelect) {
        timeOutSelect = true;
        countdownEl.classList.remove("expired");
        countdownEl.innerHTML = 'Timeout: '
            +'<input type="radio" name="timeout" class="timeout" id="timeout-30" value="30"><label for="timeout-30">30s</label>'
            +'<input type="radio" name="timeout" class="timeout" id="timeout-45" value="45"><label for="timeout-45">45s</label>'
            +'<input type="radio" name="timeout" class="timeout" id="timeout-60" value="60"><label for="timeout-60">60s</label>';
        document.querySelectorAll(".timeout").forEach((el) => { el.addEventListener('change', ask_timeout); });
    }
}

/**
 * Start a countdown timer.
 * @param {number} timetogo - Time in seconds.
 * @returns {void}.
 */
function startCountDown (timetogo)
{
    stopCountDown();
    /* For imediate display */
    countdownEl.innerHTML = countDown(timetogo);
    timeOutSelect = false;
    timerCountdown = setInterval(() => {
        if (null !== countdownEl) {
            --timetogo;
            if (timetogo < 0) {
                //stopCountDown();
                countdownEl.classList.add("expired");
            }
            else {
                countdownEl.innerHTML = countDown(timetogo);
            }
        }
        else {
            /* Timer disapeared */
            stopCountDown();
        }
    }, 1000);
}

function do_reset ()
{
    console.log("do reset");
    stopCountDown();
    select.querySelectorAll(".poker-card").forEach((el) => { el.classList.remove("poker-card-flip", "selected"); });
    review.innerHTML= "";
    result.innerHTML= "<legend>Results</legend>";
    result.style.display = "none";
    state = "select";
    reset.disabled = true;
    reveal.disabled = true;
}

function do_reveal ()
{
    console.log("do reveal");
    stopCountDown();
    state = "reveal";
    reset.disabled = false;
    reveal.disabled = true;
    const results = [];
    review.querySelectorAll(".poker-card").forEach((el) => {
        el.classList.remove("poker-card-flip");
        results[el.dataset.id]||(results[el.dataset.id] = 0);
        results[el.dataset.id]++;
    });
    results.forEach((value, i) => {
        const el2 = document.getElementById("card-"+i);
        if (el2) {
            const card = el2.cloneNode(true);
            card.id = "card-result-"+i;
            card.classList.remove("poker-card-flip", "poker-card-select", "selected");
            card.classList.add("poker-card-result");
            const newLabel = document.createElement("span");
            newLabel.classList.add("owner");
            newLabel.textContent = value;
            card.appendChild(newLabel);
            result.appendChild(card);
            result.style.display = "block";
        }
    });
}

function do_select_card ()
{
    if ("select" === state || "update" === state) {
        const id = this.dataset.id;
        const old_state = state;
        select_card(id);

        if ("select" === old_state) {
            return api_fetch("select&t="+tableId+"&v="+id+"&p="+userName);
        }
        else  {
            return api_fetch("update&t="+tableId+"&v="+id+"&p="+userName);
        }
    }
}

function select_card (id)
{
    if ("select" === state || "update" === state) {
        reset.disabled = false;
        reveal.disabled = false;
        select.querySelectorAll(".poker-card").forEach((el) => {
            if (id != el.dataset.id) {
                el.classList.remove("selected");
                el.classList.add("poker-card-flip");
            }
            else {
                el.classList.remove("poker-card-flip");
                el.classList.add("selected");
            }
        });

        if ("select" === state) {
            state = "update";
        }
    }
}

function ask_reset ()
{
    return api_fetch("reset&t="+tableId);
}

function ask_reveal ()
{
    return api_fetch("reveal&t="+tableId);
}

function ask_change_suite ()
{
    return api_fetch("suite&p="+selectSuite.value+"&t="+tableId);
}

function ask_anonymous ()
{
    return api_fetch("anonymous&v="+(anonymousEl.checked?1:0)+"&t="+tableId);
}

function update_table ()
{
    if (counter >= threshold) {
        counter = 0;
        return api_fetch("get&t="+tableId).then((get) => {
            if (! get.result) {
                if (confirm("This table does not seems to exist, would you like to go back?")) {
                    history.back();
                }
            }
            let isPokerStarted = false;
            const isAnonyous = get.anonymous;
            anonymousEl.checked = isAnonyous;
            review.innerHTML= "";
            const newTableStatus = get.status;
            let hasTableChanged = false;

            if ("" !== get.theme) {
                let tmp_theme = "";
                let tmp_theme_ext = "";
                [ tmp_theme, tmp_theme_ext ] = get.theme.split(";");
                if ((undefined !== tmp_theme) && ("" !== tmp_theme) && (theme !== tmp_theme)) {
                    theme = tmp_theme;
                    hasTableChanged = true;
                }
                if ((undefined !== tmp_theme_ext) && ("" !== tmp_theme_ext) && (theme_ext !== tmp_theme_ext)) {
                    theme_ext = tmp_theme_ext;
                    hasTableChanged = true;
                }
            }
            if ("" != get.suite && suiteName !== get.suite) {
                suiteName = get.suite;
                hasTableChanged = true;
            }
            if (hasTableChanged) {
                set_table();
            }

            get.data.forEach((val) => {
                if (val.value) {
                    const el = document.getElementById("card-"+val.value);
                    if (el) {
                        if (val.owner === userName && "select" === state) {
                            select_card(val.value);
                            console.log("Session recovered");
                        }
                        const card = el.cloneNode(true);
                        card.id = "card-review-"+val.value;
                        card.classList.remove("poker-card-select", "selected");
                        if ("reveal" !== state) {
                            card.classList.add("poker-card-flip");
                        }
                        else {
                            card.classList.remove("poker-card-flip");
                        }
                        if (! isAnonyous) {
                            const newLabel = document.createElement("span");
                            newLabel.classList.add("owner");
                            newLabel.textContent = val.owner;
                            card.appendChild(newLabel);
                        }
                        review.appendChild(card);
                        isPokerStarted = true;
                    }
                }
            });

            if ("0000-00-00 00:00:00" != get.date) {
                if (timerCountdown == null) {
                    const timetoms = new Date(get.date) - Date.now();
                    let timetos = Math.floor(timetoms/1000) /* ms to s */;
                    if (get.timeout) {
                        timetos += Number.parseInt(get.timeout, 10);
                    }
                    else {
                        timetos += DEFAULT_TIMEOUT;
                    }
                    startCountDown(timetos);
                }
            }
            else {
                stopCountDown();
                let timeout = DEFAULT_TIMEOUT;
                if (get.timeout) {
                    timeout = Number.parseInt(get.timeout, 10);
                }
                document.querySelectorAll(".timeout").forEach((el) => { el.checked = ("timeout-"+timeout == el.id); });
            }

            switch (get.status) {
            case "0": /* Select */
                if (isPokerStarted && true == reset.disabled) {
                    reset.disabled = false;
                    reveal.disabled = false;
                }
                if ("select" !== state && "update" !== state) {
                    /* Table status is to select, but client status is not */
                    do_reset();
                }
                break;
            case "1": /* Reveal */
                if ("reveal" !== state) {
                    /* Table status is to reveal, but client status is not */
                    do_reveal();
                }
                break;
            case "2": /* Reset */
                if ("select" !== state) {
                    /* Table status is to reset, but client status is not */
                    do_reset();
                }
                break;
            default:
                break;
            }
        });
    }
    else {
        counter++;
    }
}

function set_apiSource ()
{
    update_table(); // supercharge first refresh
    setInterval(update_table, 1000 /* 1s */);
    stopCountDown(); // will display timout select

    document.addEventListener("visibilitychange", () => {
        if ("visible" == document.visibilityState) {
            if (inFocus) {
                threshold = THRESHOLD_IN_FOCUS;
            }
            else {
                threshold = THRESHOLD_OUT_FOCUS;
            }
        }
        else {
            threshold = THRESHOLD_NOT_VISIBLE;
        }
    });
    document.addEventListener("focus", () => {
        inFocus = true;
        threshold = THRESHOLD_IN_FOCUS;
    });

    document.addEventListener("blur", () => {
        inFocus = false;
        threshold = THRESHOLD_OUT_FOCUS;
    });
}

function set_table()
{
    let count = 1;
    if (undefined === CARD_SUITES[suiteName]) {
        suiteName = DEFAULT_SUITE;
    }
    select.innerHTML = "";
    for (const Nb in CARD_SUITES[suiteName]) {
        const cardNb = CARD_SUITES[suiteName][Nb];
        if (SPACER_CARD != cardNb) {
            const card_back = document.createElement("div");
            card_back.classList.add("poker-card-back");
            const back_img = document.createElement("img");
            back_img.setAttribute("src", "cards/"+theme+"/back."+theme_ext);
            back_img.setAttribute("alt", "PP");
            card_back.appendChild(back_img);
            const card_inner = document.createElement("div");
            card_inner.classList.add("poker-card-inner");
            const card_front = document.createElement("div");
            card_front.classList.add("poker-card-front");
            const card_front_img = document.createElement("img");
            card_front_img.setAttribute("src", "cards/"+theme+"/"+cardNb+"."+theme_ext);
            card_front.appendChild(card_front_img);
            card_front.setAttribute("alt", cardNb);
            card_inner.appendChild(card_front);
            card_inner.appendChild(card_back);
            const card = document.createElement("div");
            card.classList.add("poker-card", "poker-card-select", "poker-card-flip");
            card.setAttribute("id", "card-"+count);
            card.dataset.id = count; card.dataset.value = cardNb;
            card.addEventListener("click", do_select_card);
            card.appendChild(card_inner);
            select.appendChild(card);
            count++;
        }
        else {
            let spacer = document.createElement("div");
            spacer.classList.add("poker-card-spacer");
            select.appendChild(spacer);
        }
    }
    selectSuite.innerHTML = "";
    for (const Suite in CARD_SUITES) {
        const optionEl = document.createElement("option");
        optionEl.textContent = Suite;
        if (suiteName === Suite) {
            optionEl.setAttribute("selected", "true");
        }
        selectSuite.appendChild(optionEl);
    }
    select.querySelectorAll(".poker-card").forEach((el) => { el.classList.remove("poker-card-flip", "selected"); });
}

const userName = JSON.parse(localStorage.getItem("userName"));
const tableId = getParameterByName("table");
let suiteName = DEFAULT_SUITE;

if (null !== userName
        && null !== tableId /* parameter found */
        && "" !== tableId /* parameter has value */
        && (+tableId === +tableId) /* check if it's a number */
        ) {
    reset.disabled = true;
    reveal.disabled = true;
    reset.addEventListener("click", ask_reset);
    reveal.addEventListener("click", ask_reveal);
    selectSuite.addEventListener("change", ask_change_suite);
    anonymousEl.addEventListener("change", ask_anonymous);

    nameEl.textContent = userName;
    suiteName = getParameterByName("suite");

    state = "select";
    set_apiSource();
}
else {
    window.location.href = "index.html";
}
