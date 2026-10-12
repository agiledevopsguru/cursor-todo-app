const TASKS_KEY = "todo.tasks.v1";
const FILTER_KEY = "todo.filter.v1";
const FILTERS = ["all", "active", "completed"];

const todayEl = document.querySelector("#today");
const countEl = document.querySelector("#count");
const progressEl = document.querySelector("#progress");
const progressFill = document.querySelector("#progress-fill");
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const errorEl = document.querySelector("#form-error");
const listEl = document.querySelector("#task-list");
const emptyEl = document.querySelector("#empty");
const announcer = document.querySelector("#announcer");
const filterButtons = [...document.querySelectorAll(".filter")];
const countBadges = {
  all: document.querySelector('[data-count="all"]'),
  active: document.querySelector('[data-count="active"]'),
  completed: document.querySelector('[data-count="completed"]'),
};

let tasks = loadTasks();
let filter = loadFilter();
let enteringId = null;
const leavingIds = new Set();

todayEl.textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

form.addEventListener("submit", onSubmit);
input.addEventListener("input", () => {
  if (input.value.trim()) clearError();
});
listEl.addEventListener("change", onListChange);
listEl.addEventListener("click", onListClick);
filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

render();

function onSubmit(event) {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    showError("Type a task before adding it.");
    input.focus();
    return;
  }

  const task = {
    id: createId(),
    text,
    completed: false,
  };

  tasks.unshift(task);
  enteringId = task.id;
  input.value = "";
  clearError();
  if (filter === "completed") {
    filter = "all";
    saveFilter();
  }
  saveTasks();
  announce(`Added “${text}”.`);
  render();
  input.focus();
}

function onListChange(event) {
  const checkbox = event.target.closest("[data-action='toggle']");
  if (!checkbox) return;
  toggleTask(checkbox.closest(".task")?.dataset.id);
}

function onListClick(event) {
  const button = event.target.closest("[data-action='delete']");
  if (!button) return;
  deleteTask(button.closest(".task")?.dataset.id);
}

function toggleTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task || leavingIds.has(id)) return;

  const willLeave =
    (filter === "active" && !task.completed) ||
    (filter === "completed" && task.completed);

  const apply = () => {
    task.completed = !task.completed;
    leavingIds.delete(id);
    saveTasks();
    announce(
      task.completed
        ? `Marked “${task.text}” complete.`
        : `Marked “${task.text}” active.`,
    );
    render({ focusId: willLeave ? null : id });
  };

  const row = listEl.querySelector(`[data-id="${cssEscape(id)}"]`);
  if (willLeave && row && !prefersReducedMotion()) {
    leaveThen(row, id, apply);
    return;
  }

  apply();
}

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task || leavingIds.has(id)) return;

  const apply = () => {
    tasks = tasks.filter((item) => item.id !== id);
    leavingIds.delete(id);
    saveTasks();
    announce(`Deleted “${task.text}”.`);
    render();
    input.focus();
  };

  const row = listEl.querySelector(`[data-id="${cssEscape(id)}"]`);
  if (row && !prefersReducedMotion()) {
    leaveThen(row, id, apply);
    return;
  }

  apply();
}

function leaveThen(row, id, apply) {
  leavingIds.add(id);
  row.classList.add("is-leaving");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    apply();
  };

  row.addEventListener("animationend", finish, { once: true });
  window.setTimeout(finish, 280);
}

function setFilter(next) {
  if (!FILTERS.includes(next) || next === filter) return;
  filter = next;
  saveFilter();
  const label = next === "all" ? "all" : next;
  announce(`Showing ${label} tasks.`);
  render();
}

function render({ focusId = null } = {}) {
  const visible = tasks.filter(matchesFilter);

  listEl.replaceChildren(...visible.map(createTaskElement));
  if (enteringId) enteringId = null;

  const remaining = tasks.filter((task) => !task.completed).length;
  const completed = tasks.length - remaining;
  const percent = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  countEl.textContent = summaryText(remaining);
  progressEl.setAttribute("aria-valuenow", String(percent));
  progressEl.setAttribute("aria-valuetext", `${percent} percent complete`);
  progressFill.style.width = `${percent}%`;

  countBadges.all.textContent = String(tasks.length);
  countBadges.active.textContent = String(remaining);
  countBadges.completed.textContent = String(completed);

  filterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
  });

  const isEmpty = visible.length === 0;
  emptyEl.hidden = !isEmpty;
  emptyEl.textContent = isEmpty ? emptyCopy() : "";

  if (focusId) {
    listEl.querySelector(`[data-id="${cssEscape(focusId)}"] input`)?.focus();
  }
}

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = "task";
  item.dataset.id = task.id;
  if (task.completed) item.classList.add("is-complete");
  if (task.id === enteringId) item.classList.add("is-entering");

  const label = document.createElement("label");
  label.className = "check";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.dataset.action = "toggle";
  checkbox.setAttribute(
    "aria-label",
    task.completed
      ? `Mark “${task.text}” as active`
      : `Mark “${task.text}” complete`,
  );

  label.append(checkbox);

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.text;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete";
  remove.dataset.action = "delete";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete “${task.text}”`);

  item.append(label, text, remove);
  return item;
}

function matchesFilter(task) {
  if (filter === "active") return !task.completed;
  if (filter === "completed") return task.completed;
  return true;
}

function summaryText(remaining) {
  if (tasks.length === 0) return "No tasks yet";
  if (remaining === 0) return "All done";
  if (remaining === 1) return "1 task left";
  return `${remaining} tasks left`;
}

function emptyCopy() {
  if (tasks.length === 0) return "No tasks yet. Add one above.";
  if (filter === "active") return "Nothing active. You're caught up.";
  return "No completed tasks yet.";
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", "form-error");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.hidden = true;
  input.removeAttribute("aria-invalid");
  input.removeAttribute("aria-describedby");
}

function announce(message) {
  announcer.textContent = "";
  window.requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTask).map((task) => ({
      id: String(task.id),
      text: String(task.text).slice(0, 180),
      completed: Boolean(task.completed),
    }));
  } catch {
    return [];
  }
}

function loadFilter() {
  const stored = localStorage.getItem(FILTER_KEY);
  return FILTERS.includes(stored) ? stored : "all";
}

function saveTasks() {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch {
    announce("Tasks could not be saved in this browser.");
  }
}

function saveFilter() {
  try {
    localStorage.setItem(FILTER_KEY, filter);
  } catch {
    announce("The filter could not be saved in this browser.");
  }
}

function isTask(value) {
  return (
    value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    typeof value.completed === "boolean"
  );
}

function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
