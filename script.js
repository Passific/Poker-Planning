"use strict";
/**
 * @author Passific https://github.com/Passific/Poker-Planning
 */

const API_URL = "api.php?a=";
const ROOM_CHECK_DELAY_MS = 1000;

const roomActionBtnEl = document.getElementById("room-action");
const nameInputEl = document.getElementById("name-input");
const roomInputEl = document.getElementById("room-input");
const roomLockEl = document.getElementById("room-lock");
const roomStatusEl = document.getElementById("room-status");
const roomHelpEl = document.getElementById("room-help");

let currentAction = null;
let isBusy = false;
let checkTimer = null;
let lastCheckedRoom = "";
let lastRoomExists = null;
let requestSequence = 0;
let isRoomLocked = false;

function apiFetch(url)
{
    return fetch(API_URL + url).then((response) => {
        if (200 !== response.status) {
            return Promise.reject(new Error("apiFetch " + url + " response.status=" + response.status));
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
        .replace(/ /g, "_")
        .replace(/[^A-Z0-9_-]/g, "")
        .substring(0, 24);
}

function saveName(name)
{
    localStorage.setItem("userName", JSON.stringify(name));
}

function saveRoom(room)
{
    localStorage.setItem("roomCode", JSON.stringify(room));
}

function goToRoom(room)
{
    window.location.href = "table.html?room=" + encodeURIComponent(room);
}

function getFormData()
{
    const name = String(nameInputEl.value || "").trim();
    const room = sanitizeRoom(roomInputEl.value);
    return { name, room };
}

function setButtonState(label, disabled, kind)
{
    roomActionBtnEl.textContent = label;
    roomActionBtnEl.disabled = disabled;
    roomActionBtnEl.dataset.kind = kind || "neutral";
}

function setStatus(text)
{
    roomStatusEl.textContent = text;
}

function clearPendingCheck()
{
    if (null !== checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = null;
    }
}

function updateUiState()
{
    const form = getFormData();

    roomInputEl.value = form.room;

    if (isBusy) {
        return;
    }

    if ("" === form.name && "" === form.room) {
        setButtonState("Enter name", true, "neutral");
        setStatus("Enter your name to create a room automatically.");
        return;
    }

    if ("" === form.name) {
        setButtonState("Enter name", true, "neutral");
        setStatus("Your name is required before joining or creating a room.");
        return;
    }

    if ("" === form.room) {
        currentAction = "create";
        setButtonState("Create", false, "create");
        setStatus("No room code provided. A new room code will be generated.");
        return;
    }

    if (form.room !== lastCheckedRoom || null === lastRoomExists) {
        setButtonState("Checking...", true, "checking");
        setStatus("Waiting 1 second before checking room availability.");
        scheduleRoomCheck();
        return;
    }

    if (lastRoomExists) {
        currentAction = "join";
        setButtonState("Join", false, "join");
        if (isRoomLocked) {
            setStatus("Shared room link detected. Please join the others.");
        } else {
            setStatus("This room exists. You can join it.");
        }
        return;
    }

    currentAction = "create";
    setButtonState("Create", false, "create");
    setStatus("This room does not exist yet. You can create it.");
}

function scheduleRoomCheck()
{
    const form = getFormData();

    clearPendingCheck();
    lastCheckedRoom = "";
    lastRoomExists = null;
    currentAction = null;

    if ("" === form.name || "" === form.room || isBusy) {
        return;
    }

    checkTimer = setTimeout(() => {
        const currentForm = getFormData();
        if (currentForm.room !== form.room || currentForm.name !== form.name || isBusy) {
            return;
        }
        checkRoomExists(currentForm.room);
    }, ROOM_CHECK_DELAY_MS);
}

function checkRoomExists(room)
{
    const seq = ++requestSequence;
    setButtonState("Checking...", true, "checking");
    setStatus("Checking whether this room already exists.");

    apiFetch("room_exists&room=" + encodeURIComponent(room)).then((result) => {
        if (seq !== requestSequence) {
            return;
        }

        lastCheckedRoom = room;
        lastRoomExists = Boolean(result.result && result.exists);
        updateUiState();
    }).catch(() => {
        if (seq !== requestSequence) {
            return;
        }

        lastCheckedRoom = "";
        lastRoomExists = null;
        setButtonState("Retry", false, "error");
        currentAction = "retry";
        setStatus("Room check failed. Retry when ready.");
    });
}

function joinOrCreateRoom()
{
    const form = getFormData();

    if (isBusy || "" === form.name) {
        updateUiState();
        return;
    }

    if ("retry" === currentAction) {
        if ("" === form.room) {
            currentAction = "create";
        }
        else {
            scheduleRoomCheck();
            updateUiState();
            return;
        }
    }

    if ("" !== form.room && (form.room !== lastCheckedRoom || null === lastRoomExists || null === currentAction)) {
        scheduleRoomCheck();
        updateUiState();
        return;
    }

    isBusy = true;
    clearPendingCheck();
    saveName(form.name);

    if ("join" === currentAction) {
        setButtonState("Joining...", true, "join");
        setStatus("Joining existing room.");
        goToRoom(form.room);
        return;
    }

    setButtonState("Creating...", true, "create");
    setStatus("Creating room.");

    apiFetch("create_room&room=" + encodeURIComponent(form.room)).then((result) => {
        if (result.result && result.room) {
            goToRoom(result.room);
            return;
        }

        isBusy = false;
        if ("room_exists" === result.error) {
            lastCheckedRoom = form.room;
            lastRoomExists = true;
            updateUiState();
            return;
        }

        setButtonState("Retry", false, "error");
        currentAction = "retry";
        setStatus("Could not create room right now. Retry.");
    }).catch(() => {
        isBusy = false;
        setButtonState("Retry", false, "error");
        currentAction = "retry";
        setStatus("Could not create room right now. Retry.");
    });
}

function handleInputChange()
{
    if (!isRoomLocked) {
        const sanitizedRoom = sanitizeRoom(roomInputEl.value);
        if (roomInputEl.value !== sanitizedRoom) {
            roomInputEl.value = sanitizedRoom;
        }
    }
    updateUiState();
}

nameInputEl.addEventListener("input", handleInputChange);
roomInputEl.addEventListener("input", handleInputChange);

nameInputEl.addEventListener("keyup", (event) => {
    if ("Enter" === event.key && !roomActionBtnEl.disabled) {
        joinOrCreateRoom();
    }
});

roomInputEl.addEventListener("keyup", (event) => {
    if ("Enter" === event.key && !roomActionBtnEl.disabled) {
        joinOrCreateRoom();
    }
});

roomActionBtnEl.addEventListener("click", joinOrCreateRoom);

const userName = JSON.parse(localStorage.getItem("userName"));
if (null !== userName && "" !== userName) {
    nameInputEl.value = userName;
}

const roomCode = JSON.parse(localStorage.getItem("roomCode"));
if (null !== roomCode && "" !== roomCode) {
    roomInputEl.value = roomCode;
}

const roomParam = sanitizeRoom(getParameterByName("room"));
if ("" !== roomParam) {
    isRoomLocked = true;
    roomInputEl.value = roomParam;
    roomInputEl.style.display = "none";
    roomLockEl.hidden = false;
    document.getElementById("room-lock-name").textContent = roomParam;
    roomHelpEl.style.display = "none";

    lastCheckedRoom = roomParam;
    lastRoomExists = true;
    currentAction = "join";
}
else {
    const createRoomParam = sanitizeRoom(getParameterByName("create"));
    if ("" !== createRoomParam) {
        roomInputEl.value = createRoomParam;
    }
}

updateUiState();
nameInputEl.focus();
