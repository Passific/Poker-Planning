"use strict";
/**
 * @author Passific https://github.com/Passific/Poker-Planning
 */

const CURRENT_VERSION = "0.4";

const join = document.getElementById("join");
const nameInput = document.getElementById("name-input");

const default_table_id = 2;

function save_name (name)
{
    localStorage.setItem("userName", JSON.stringify(name));
    window.location.href = "table.html?table="+table;
}

function set_table ()
{
    table = this.value;
    localStorage.setItem("table", JSON.stringify(table));
}

nameInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter" && "" != event.target.value) {
        save_name(event.target.value);
    }
});

join.addEventListener("click", (event) => {
    if ("" != nameInput.value) {
        save_name(nameInput.value);
    }
});

document.querySelectorAll(".tables").forEach((el) => {
    el.addEventListener('change', set_table);
});

let userName = JSON.parse(localStorage.getItem("userName"));
if ("" !== userName) {
    nameInput.value = userName;
}

let table = JSON.parse(localStorage.getItem("table"));
if (null === table) {
    table = default_table_id;
}
document.querySelectorAll(".tables").forEach((el) => { el.checked = ("table-"+table == el.id); });

nameInput.focus();
