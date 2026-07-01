"use strict";
/**
 * @author Passific https://github.com/Passific/Poker-Planning
 */

const CURRENT_VERSION = "0.6";
const API_URL = "api.php?a=";

/* Thresholds and timeouts in seconds */
const THRESHOLD_IN_FOCUS = 1;
const THRESHOLD_OUT_FOCUS = 3;
const THRESHOLD_NOT_VISIBLE = 30;
const DEFAULT_TIMEOUT = 60;

const SPACER_CARD = "!spacer!";
const CARD_SUITES = {
    "fibonacci2": [0, 1, 2, 3, 5, 8, 13, 20, 40, 100, SPACER_CARD, "coffee", "infinite", "question"],
    "confidence": [1, 2, 3, 4, 5],
    "scale": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
};
const DEFAULT_SUITE = "fibonacci2";

let state = "name";
let theme = "basic";
let theme_ext = "svg";
let counter = 10;
let inFocus = true;
let threshold = 1;
let latestVersion = -1;

const selectEl = document.getElementById("poker-select");
const selectSuiteEl = document.getElementById("select-suite");
const reviewEl = document.getElementById("poker-review");
const resultEl = document.getElementById("poker-result");
const resetBtnEl = document.getElementById("reset");
const revealBtnEl = document.getElementById("reveal");
const anonymousEl = document.getElementById("anonymous");
const nameEl = document.getElementById("name");
const countdownEl = document.getElementById("countdown");
const roomCodeEl = document.getElementById("room-code");
const copyLinkBtnEl = document.getElementById("copy-link");
const participantsListEl = document.getElementById("participants-list");

let timerCountdown = null;
let timeOutSelect = false;
let pollSequence = 0;

function api_fetch(url)
{
    return fetch(API_URL + url).then((response) => {
        if (200 !== response.status) {
            return Promise.reject(new Error("api_fetch " + url + " response.status=" + response.status));
        }
        return response.json();
    });
}

function getParameterByName(name)
{
    return new URLSearchParams(window.location.search).get(name);
}

function sanitizeRoom(room)
{
    return String(room || "")
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "")
        .substring(0, 24);
}

function countDown(time)
{
    return "Remaining time: " + time;
}

function ask_timeout()
{
    return api_fetch("timeout&room=" + encodeURIComponent(roomCode) + "&v=" + this.value);
}

function stopCountDown()
{
    if (null !== timerCountdown) {
        clearInterval(timerCountdown);
        timerCountdown = null;
    }
    if (!timeOutSelect) {
        timeOutSelect = true;
        countdownEl.classList.remove("expired");
        countdownEl.innerHTML = "Timeout: "
            + "<input type=\"radio\" name=\"timeout\" class=\"timeout\" id=\"timeout-30\" value=\"30\"><label for=\"timeout-30\">30s</label>"
            + "<input type=\"radio\" name=\"timeout\" class=\"timeout\" id=\"timeout-45\" value=\"45\"><label for=\"timeout-45\">45s</label>"
            + "<input type=\"radio\" name=\"timeout\" class=\"timeout\" id=\"timeout-60\" value=\"60\"><label for=\"timeout-60\">60s</label>";
        document.querySelectorAll(".timeout").forEach((el) => {
            el.addEventListener("change", ask_timeout);
        });
    }
}

function startCountDown(timeToGo)
{
    if (timeToGo <= 0) {
        if (null !== timerCountdown) {
            clearInterval(timerCountdown);
            timerCountdown = null;
        }
        timeOutSelect = false;
        countdownEl.classList.add("expired");
        countdownEl.innerHTML = "Time expired";
        return;
    }

    stopCountDown();
    countdownEl.innerHTML = countDown(timeToGo);
    timeOutSelect = false;
    timerCountdown = setInterval(() => {
        if (null !== countdownEl) {
            --timeToGo;
            if (timeToGo < 0) {
                countdownEl.classList.add("expired");
                countdownEl.innerHTML = "Time expired";
                if (null !== timerCountdown) {
                    clearInterval(timerCountdown);
                    timerCountdown = null;
                }
            }
            else {
                countdownEl.innerHTML = countDown(timeToGo);
            }
        }
        else {
            stopCountDown();
        }
    }, 1000);
}

function do_reset()
{
    stopCountDown();
    selectEl.querySelectorAll(".poker-card").forEach((el) => {
        el.classList.remove("poker-card-flip", "selected");
    });
    reviewEl.innerHTML = "";
    resultEl.innerHTML = "<legend>Results</legend>";
    resultEl.style.display = "none";
    state = "select";
    resetBtnEl.disabled = true;
    revealBtnEl.disabled = true;
    selectSuiteEl.disabled = false;
    anonymousEl.disabled = false;
}

function do_reveal()
{
    stopCountDown();
    state = "reveal";
    resetBtnEl.disabled = false;
    revealBtnEl.disabled = true;
    selectSuiteEl.disabled = false;
    anonymousEl.disabled = false;
    const results = [];
    reviewEl.querySelectorAll(".poker-card").forEach((el) => {
        el.classList.remove("poker-card-flip");
        results[el.dataset.id] || (results[el.dataset.id] = 0);
        results[el.dataset.id]++;
    });
    const maxVotes = results.reduce((max, value) => {
        return Math.max(max, value || 0);
    }, 0);
    let firstVoted = -1;
    let lastVoted = -1;
    for (let i = 1; i < results.length; i++) {
        if ((results[i] || 0) > 0) {
            if (-1 === firstVoted) {
                firstVoted = i;
            }
            lastVoted = i;
        }
    }

    if (-1 !== firstVoted) {
        let previousWasSpacer = false;
        for (let i = firstVoted; i <= lastVoted; i++) {
            const value = results[i] || 0;
            if (0 === value) {
                if (!previousWasSpacer) {
                    const spacer = document.createElement("div");
                    spacer.classList.add("poker-card-spacer", "poker-card-spacer-reveal");
                    resultEl.appendChild(spacer);
                    previousWasSpacer = true;
                }
                continue;
            }

            const el2 = document.getElementById("card-" + i);
            if (el2) {
                const card = el2.cloneNode(true);
                card.id = "card-result-" + i;
                card.classList.remove("poker-card-flip", "poker-card-select", "selected");
                card.classList.add("poker-card-result");
                if (maxVotes > 1) {
                    const scale = 0.92 + (0.26 * value / maxVotes);
                    card.style.setProperty("--result-scale", scale.toFixed(2));
                }
                const newLabel = document.createElement("span");
                newLabel.classList.add("owner");
                newLabel.textContent = value;
                card.appendChild(newLabel);
                resultEl.appendChild(card);
                resultEl.style.display = "block";
                previousWasSpacer = false;
            }
        }
    }
}

function do_select_card()
{
    if ("select" === state || "update" === state) {
        const id = this.dataset.id;
        select_card(id);
        return api_fetch("select&room=" + encodeURIComponent(roomCode) + "&v=" + id + "&p=" + encodeURIComponent(userName));
    }
}

function select_card(id)
{
    if ("select" === state || "update" === state) {
        resetBtnEl.disabled = false;
        revealBtnEl.disabled = false;
        selectSuiteEl.disabled = true;
        anonymousEl.disabled = true;
        selectEl.querySelectorAll(".poker-card").forEach((el) => {
            if (id !== el.dataset.id) {
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

function ask_reset()
{
    return api_fetch("reset&room=" + encodeURIComponent(roomCode));
}

function ask_reveal()
{
    return api_fetch("reveal&room=" + encodeURIComponent(roomCode));
}

function ask_change_suite()
{
    return api_fetch("suite&p=" + encodeURIComponent(this.value) + "&room=" + encodeURIComponent(roomCode));
}

function ask_anonymous()
{
    return api_fetch("anonymous&v=" + (this.checked ? 1 : 0) + "&room=" + encodeURIComponent(roomCode));
}

function renderParticipants(participants)
{
    if (!participantsListEl) {
        return;
    }

    const connected = participants.filter((participant) => participant.connected);
    participantsListEl.innerHTML = "";

    if (0 === connected.length) {
        participantsListEl.textContent = "No connected participants";
        return;
    }

    connected.forEach((participant) => {
        const row = document.createElement("div");
        row.classList.add("participant-row");

        const name = document.createElement("span");
        name.classList.add("participant-name");
        name.textContent = participant.owner + (participant.owner === userName ? " (you)" : "");

        const status = document.createElement("span");
        status.classList.add("participant-status");
        status.classList.add(participant.voted ? "voted" : "waiting");
        status.textContent = participant.voted ? "voted" : "waiting";

        row.appendChild(name);
        row.appendChild(status);
        participantsListEl.appendChild(row);
    });
}

function syncCountdown(get)
{
    if (EMPTY_DATE !== get.date) {
        const timeToMs = new Date(get.date.replace(" ", "T")) - Date.now();
        let timeToS = Math.floor(timeToMs / 1000);
        if (get.timeout) {
            timeToS += Number.parseInt(get.timeout, 10);
        }
        else {
            timeToS += DEFAULT_TIMEOUT;
        }

        if (timeToS <= 0) {
            startCountDown(timeToS);
        }
        else if (null === timerCountdown) {
            startCountDown(timeToS);
        }
    }
    else {
        stopCountDown();
        let timeout = DEFAULT_TIMEOUT;
        if (get.timeout) {
            timeout = Number.parseInt(get.timeout, 10);
        }
        document.querySelectorAll(".timeout").forEach((el) => {
            el.checked = ("timeout-" + timeout === el.id);
        });
    }
}

function applyServerTableState(get)
{
    if (!get.result || !get.exists) {
        if (confirm("This room does not seem to exist, would you like to go back?")) {
            window.location.href = "index.html" + ("" !== roomCode ? "?create=" + encodeURIComponent(roomCode) : "");
        }
        return;
    }

    renderParticipants(get.participants || []);

    syncCountdown(get);

    if (!get.changed) {
        return;
    }

    let isPokerStarted = false;
    const isAnonymous = get.anonymous;
    anonymousEl.checked = isAnonymous;
    const newTableStatus = get.status;
    let hasTableChanged = false;

    if ("" !== get.theme) {
        let tmp_theme = "";
        let tmp_theme_ext = "";
        [tmp_theme, tmp_theme_ext] = get.theme.split(";");
        if (undefined !== tmp_theme && "" !== tmp_theme && theme !== tmp_theme) {
            theme = tmp_theme;
            hasTableChanged = true;
        }
        if (undefined !== tmp_theme_ext && "" !== tmp_theme_ext && theme_ext !== tmp_theme_ext) {
            theme_ext = tmp_theme_ext;
            hasTableChanged = true;
        }
    }

    if ("" !== get.suite && suiteName !== get.suite) {
        suiteName = get.suite;
        hasTableChanged = true;
    }

    if (hasTableChanged) {
        set_table();
    }
    reviewEl.innerHTML = "";
    const availableTemplates = Array.from(selectEl.querySelectorAll(".poker-card"));

    get.data.forEach((val) => {
        const showRealCard = ("1" === newTableStatus && val.value);
        const randomTemplate = (availableTemplates.length > 0)
            ? availableTemplates[Math.floor(Math.random() * availableTemplates.length)]
            : null;
        const templateCard = showRealCard
            ? document.getElementById("card-" + val.value)
            : randomTemplate;

        if (templateCard) {
            if (showRealCard && val.owner === userName && "select" === state) {
                select_card(String(val.value));
            }

            const card = templateCard.cloneNode(true);
            card.id = "card-review-" + (showRealCard ? val.value : (val.id || "hidden"));
            card.classList.remove("poker-card-select", "selected");
            if (showRealCard && "reveal" === state) {
                card.classList.remove("poker-card-flip");
            }
            else {
                card.classList.add("poker-card-flip");
            }
            if (!isAnonymous) {
                const newLabel = document.createElement("span");
                newLabel.classList.add("owner");
                newLabel.textContent = val.owner;
                card.appendChild(newLabel);
            }
            reviewEl.appendChild(card);
            isPokerStarted = true;
        }
    });

    switch (newTableStatus) {
        case "0":
            if (isPokerStarted && true === resetBtnEl.disabled) {
                resetBtnEl.disabled = false;
                revealBtnEl.disabled = false;
                selectSuiteEl.disabled = false;
                anonymousEl.disabled = false;
            }
            if ("select" !== state && "update" !== state) {
                do_reset();
            }
            break;
        case "1":
            if ("reveal" !== state) {
                do_reveal();
            }
            break;
        case "2":
            if ("select" !== state) {
                do_reset();
            }
            break;
        default:
            break;
    }
}

const EMPTY_DATE = "0000-00-00 00:00:00";
function update_table()
{
    if (counter >= threshold) {
        counter = 0;
        const seq = ++pollSequence;
        const url = "get&room=" + encodeURIComponent(roomCode) + "&since=" + latestVersion + "&p=" + encodeURIComponent(userName);
        return api_fetch(url).then((get) => {
            if (seq !== pollSequence) {
                return;
            }
            if (get.result && get.exists && undefined !== get.version) {
                latestVersion = get.version;
            }
            applyServerTableState(get);
        });
    }

    counter++;
    return Promise.resolve();
}

function startTable()
{
    update_table();
    setInterval(update_table, 1000);
    stopCountDown();

    document.addEventListener("visibilitychange", () => {
        if ("visible" === document.visibilityState) {
            if (null !== timerCountdown) {
                clearInterval(timerCountdown);
                timerCountdown = null;
            }
            counter = threshold;
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

function cheat()
{
    window.location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
}

function set_table()
{
    let count = 1;
    if (undefined === CARD_SUITES[suiteName]) {
        suiteName = DEFAULT_SUITE;
    }
    selectEl.innerHTML = "";
    for (const Nb in CARD_SUITES[suiteName]) {
        const cardNb = CARD_SUITES[suiteName][Nb];
        if (SPACER_CARD !== cardNb) {
            const card_back = document.createElement("div");
            card_back.classList.add("poker-card-back");
            const back_img = document.createElement("img");
            back_img.setAttribute("src", "cards/" + theme + "/back." + theme_ext);
            back_img.setAttribute("alt", "PP");
            card_back.appendChild(back_img);

            const card_inner = document.createElement("div");
            card_inner.classList.add("poker-card-inner");

            const card_front = document.createElement("div");
            card_front.classList.add("poker-card-front");
            const card_front_img = document.createElement("img");
            card_front_img.setAttribute("src", "cards/" + theme + "/" + cardNb + "." + theme_ext);
            card_front.appendChild(card_front_img);
            card_front.setAttribute("alt", cardNb);
            card_inner.appendChild(card_front);
            card_inner.appendChild(card_back);

            const card = document.createElement("div");
            card.classList.add("poker-card", "poker-card-select", "poker-card-flip");
            card.setAttribute("id", "card-" + count);
            card.dataset.id = String(count);
            card.dataset.value = cardNb;
            card.addEventListener("click", do_select_card);
            card.appendChild(card_inner);
            selectEl.appendChild(card);
            count++;
        }
        else {
            const spacer = document.createElement("div");
            spacer.classList.add("poker-card-spacer");
            selectEl.appendChild(spacer);
        }
    }

    selectSuiteEl.innerHTML = "";
    for (const Suite in CARD_SUITES) {
        const optionEl = document.createElement("option");
        optionEl.textContent = Suite;
        if (suiteName === Suite) {
            optionEl.setAttribute("selected", "true");
        }
        selectSuiteEl.appendChild(optionEl);
    }
    selectEl.querySelectorAll(".poker-card").forEach((el) => {
        el.classList.remove("poker-card-flip", "selected");
    });
}

function copyCurrentLink()
{
    navigator.clipboard.writeText(window.location.href).then(() => {
        copyLinkBtnEl.textContent = "Copied";
        setTimeout(() => {
            copyLinkBtnEl.textContent = "Copy link";
        }, 1500);
    });
}

const userName = JSON.parse(localStorage.getItem("userName"));
const roomCodeFromUrl = sanitizeRoom(getParameterByName("room"));
const legacyTableId = String(getParameterByName("table") || "").trim();
const roomCode = ("" !== roomCodeFromUrl)
    ? roomCodeFromUrl
    : ((/^\d+$/.test(legacyTableId)) ? ("LEGACY_" + legacyTableId) : "");
let suiteName = DEFAULT_SUITE;

console.log("%cMade by Passific. Version " + CURRENT_VERSION, "color: white; font-size: x-large; font-weight: bold; background-color: #0b0f3e; margin: 10px; padding: 10px");
console.log("%cYou like to look under the hood!\nMaybe you are trying to cheat?\nIf so I'll make it easy for you, just call the cheat() function.", "color: white; font-size: medium; font-weight: bold; background-color:rgb(132, 0, 0); margin: 1px; padding: 1px");

if (
    null !== userName
    && null !== roomCode
    && "" !== roomCode
) {
    resetBtnEl.disabled = true;
    revealBtnEl.disabled = true;
    selectSuiteEl.disabled = false;
    anonymousEl.disabled = false;

    resetBtnEl.addEventListener("click", ask_reset);
    revealBtnEl.addEventListener("click", ask_reveal);
    selectSuiteEl.addEventListener("change", ask_change_suite);
    anonymousEl.addEventListener("change", ask_anonymous);
    copyLinkBtnEl.addEventListener("click", copyCurrentLink);

    roomCodeEl.textContent = roomCode;
    nameEl.textContent = userName;
    suiteName = getParameterByName("suite") || DEFAULT_SUITE;

    localStorage.setItem("roomCode", JSON.stringify(roomCode));

    state = "select";
    set_table();
    startTable();
}
else {
    window.location.href = "index.html" + ("" !== roomCode ? "?room=" + encodeURIComponent(roomCode) : "");
}
