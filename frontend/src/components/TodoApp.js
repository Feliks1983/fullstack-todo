import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

const FILES_BASE = /^https?:\/\//.test(API_URL)
  ? `${new URL(API_URL).origin}/uploads/`
  : "/uploads/";

const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
const EMPTY_FORM = {
  title: "",
  description: "",
  priority: "medium",
  dueDate: "",
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : null;

export default function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [totals, setTotals] = useState({ all: 0, completed: 0, pending: 0 });
  const [filters, setFilters] = useState({ status: "", priority: "" });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  const showError = (err) =>
    setError(err.response?.data?.error || err.message || "Неизвестная ошибка");

  const loadTodos = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      const { data } = await axios.get(`${API_URL}/todos`, { params });
      setTodos(data.todos);
      setPagination(data.pagination);
      setTotals(data.totals);
      setError("");
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const matchesFilters = (todo) =>
    (!filters.status || (filters.status === "completed") === todo.completed) &&
    (!filters.priority || filters.priority === todo.priority);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(
        ([key, value]) => value && body.append(key, value),
      );
      files.forEach((file) => body.append("attachments", file));
      const { data } = await axios.post(`${API_URL}/todos`, body);
      setForm(EMPTY_FORM);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      setTotals((t) => ({
        ...t,
        all: t.all + 1,
        pending: t.pending + (data.completed ? 0 : 1),
        completed: t.completed + (data.completed ? 1 : 0),
      }));
      if (matchesFilters(data))
        setTodos((prev) => [data, ...prev].slice(0, 10));
      setError("");
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (todo) => {
    try {
      const { data } = await axios.put(`${API_URL}/todos/${todo._id}`, {
        completed: !todo.completed,
      });
      setTodos((prev) =>
        prev.map((t) => (t._id === data._id ? data : t)).filter(matchesFilters),
      );
      setTotals((t) => ({
        ...t,
        completed: t.completed + (data.completed ? 1 : -1),
        pending: t.pending + (data.completed ? -1 : 1),
      }));
    } catch (err) {
      showError(err);
    }
  };

  const remove = async (todo) => {
    if (!window.confirm(`Удалить задачу «${todo.title}»?`)) return;
    try {
      await axios.delete(`${API_URL}/todos/${todo._id}`);
      setTodos((prev) => prev.filter((t) => t._id !== todo._id));
      setTotals((t) => ({
        all: t.all - 1,
        completed: t.completed - (todo.completed ? 1 : 0),
        pending: t.pending - (todo.completed ? 0 : 1),
      }));
    } catch (err) {
      showError(err);
    }
  };

  const onFilter = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1);
  };

  return (
    <div className="todo-app">
      <h1>Fullstack Todo</h1>
      <div className="todo-stats">
        Total: {totals.all} · Completed: {totals.completed} · At work:{" "}
        {totals.pending}
      </div>

      {error && <div className="error">{error}</div>}

      <form className="todo-form" onSubmit={onSubmit}>
        <input
          name="title"
          placeholder="Название задачи"
          value={form.title}
          onChange={onChange}
          maxLength={200}
          required
        />
        <textarea
          name="description"
          placeholder="Описание"
          value={form.description}
          onChange={onChange}
        />
        <div className="row">
          <select name="priority" value={form.priority} onChange={onChange}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                Priority: {label}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dueDate"
            value={form.dueDate}
            onChange={onChange}
          />
          <input
            type="file"
            multiple
            ref={fileInput}
            onChange={(e) => setFiles(Array.from(e.target.files))}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? "Сохранение…" : "Добавить задачу"}
        </button>
      </form>

      <div className="todo-filters">
        <select name="status" value={filters.status} onChange={onFilter}>
          <option value="">Все статусы</option>
          <option value="pending">В работе</option>
          <option value="completed">Выполненные</option>
        </select>
        <select name="priority" value={filters.priority} onChange={onFilter}>
          <option value="">Любой приоритет</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p>Загрузка…</p>}
      {!loading && todos.length === 0 && <p>Задач пока нет.</p>}

      {todos.map((todo) => (
        <div
          key={todo._id}
          className={`todo-item ${todo.priority} ${todo.completed ? "done" : ""}`}
        >
          <div className="todo-head">
            <div>
              <div className="todo-title">{todo.title}</div>
              <div className="todo-meta">
                <span className="badge">{PRIORITY_LABELS[todo.priority]}</span>
                <span className="badge">
                  {todo.completed ? "Выполнено" : "В работе"}
                </span>
                {todo.dueDate && <span>Срок: {formatDate(todo.dueDate)}</span>}
              </div>
            </div>
            <div className="todo-actions">
              <button className="secondary" onClick={() => toggle(todo)}>
                {todo.completed ? "Вернуть" : "Завершить"}
              </button>
              <button className="danger" onClick={() => remove(todo)}>
                Удалить
              </button>
            </div>
          </div>
          {todo.description && <p>{todo.description}</p>}
          {todo.attachments?.length > 0 && (
            <ul className="attachments">
              {todo.attachments.map((a) => (
                <li key={a.filename}>
                  📎{" "}
                  <a
                    href={`${FILES_BASE}${a.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.originalName}
                  </a>{" "}
                  ({formatSize(a.size)})
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {pagination.pages > 1 && (
        <div className="pager">
          <button
            className="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Назад
          </button>
          <span>
            {pagination.page} / {pagination.pages}
          </span>
          <button
            className="secondary"
            disabled={page >= pagination.pages}
            onClick={() => setPage(page + 1)}
          >
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}
