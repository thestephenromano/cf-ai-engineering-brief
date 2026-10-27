import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  emptyState,
  exportBrief,
  LIMITS,
  type BriefState,
  type Task,
} from "./domain";
import "./styles.css";

const examples = [
  {
    title: "Start something new",
    text: "I want to build a team knowledge base. We have two engineers and two weeks. Help me define a small first release.",
  },
  {
    title: "Untangle a problem",
    text: "Our webhook consumer sometimes processes events twice. Help me plan a fix with clear acceptance criteria.",
  },
  {
    title: "Make a migration safer",
    text: "We need to move a read-heavy API to Cloudflare Workers. What should we validate before migrating?",
  },
];

async function api(path: string, body?: unknown): Promise<BriefState> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (await response.json()) as BriefState & {
    error?: { message: string };
  };
  if (!response.ok)
    throw new Error(
      value.error?.message ?? "The request failed. Please try again.",
    );
  return value;
}

function App() {
  const [state, setState] = useState<BriefState>(emptyState);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [view, setView] = useState<"pending" | "plan">("pending");
  const retry = useRef<{ id: string; message: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api("/api/state")
      .then((value) => {
        if (active) {
          setState(value);
          setReady(true);
        }
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.turns.length, submitted]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setState(await api("/api/state"));
      setReady(true);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not refresh.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy || !ready) return;
    const request =
      retry.current?.message === message
        ? retry.current
        : { id: crypto.randomUUID(), message };
    retry.current = request;
    setBusy(true);
    setSubmitted(message);
    setError("");
    try {
      const next = await api("/api/chat", request);
      setState(next);
      setDraft("");
      retry.current = null;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not send your message.",
      );
    } finally {
      setBusy(false);
      setSubmitted("");
      input.current?.focus();
    }
  }

  async function decide(task: Task, action: "accepted" | "dismissed" | "done") {
    setBusy(true);
    setError("");
    try {
      setState(await api("/api/decision", { id: task.id, action }));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not update this task.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function newBrief() {
    if (
      state.turns.length &&
      !window.confirm(
        "Start a new brief? Export this one first if you want to keep a copy. You won’t be able to return to it from this browser.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      setState(await api("/api/session", {}));
      setReady(true);
      setDraft("");
      retry.current = null;
      setView("pending");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start a new brief.",
      );
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([exportBrief(state)], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "engineering-brief.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  const pending = state.tasks.filter((task) => task.status === "pending");
  const plan = state.tasks.filter(
    (task) => task.status === "accepted" || task.status === "done",
  );
  const done = plan.filter((task) => task.status === "done").length;
  const tasks = view === "pending" ? pending : plan;

  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="wordmark" href="/" aria-label="Engineering Brief home">
          <span className="logo">
            eb<span>·</span>
          </span>
          <span>
            Engineering
            <br />
            Brief
          </span>
        </a>
        <div className="rail-label">WORKSPACE / 01</div>
        <div className="nav-active">
          <span>▤</span> Your brief <span className="nav-dot" />
        </div>
        <button className="rail-button" onClick={newBrief} disabled={busy}>
          ＋ &nbsp; New brief
        </button>
        <div className="rail-note">
          <div className="orbit">✳</div>
          <h2>
            Good work starts
            <br />
            with a clear plan.
          </h2>
          <p>
            A little structure.
            <br />A useful second opinion.
            <br />
            The decisions stay yours.
          </p>
        </div>
        <div className="rail-footer">
          <span className="status-dot" /> Built on Cloudflare <span>↗</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <span>
            THE WORKBENCH <span className="slash">/</span>{" "}
            <strong>New possibilities</strong>
          </span>
          <span className="session-label">
            <span className="status-dot" />{" "}
            {ready ? "Saved in this browser’s session" : "Connecting…"}
          </span>
        </header>
        <section className="page-heading">
          <div>
            <p className="eyebrow">FROM IDEA TO IMPLEMENTATION</p>
            <h1>
              Give your next idea a plan<span>.</span>
            </h1>
            <p className="subtitle">
              Talk it through. Review the next steps. Build with intention.
            </p>
          </div>
          <button
            className="export-button"
            onClick={download}
            disabled={!state.turns.length || busy}
          >
            Export brief <span>↗</span>
          </button>
        </section>

        <div className="workspace">
          <section
            className="conversation panel"
            aria-labelledby="conversation-title"
          >
            <div className="panel-heading">
              <div className="panel-title">
                <span className="section-number">01</span>
                <h2 id="conversation-title">The conversation</h2>
              </div>
              <button
                className="text-button"
                onClick={refresh}
                disabled={busy}
                aria-label="Refresh saved brief"
              >
                ↻ Refresh
              </button>
            </div>
            <div
              className="chat-scroll"
              role="log"
              aria-label="Conversation"
              aria-live="polite"
            >
              {!state.turns.length && !submitted && (
                <div className="welcome">
                  <div className="welcome-mark">✳</div>
                  <p className="eyebrow">A THOUGHT PARTNER, ON CALL</p>
                  <h3>What are you working on?</h3>
                  <p>
                    Bring an idea, a tricky constraint, or a problem worth
                    solving. We’ll turn it into small, testable steps.
                  </p>
                  <div className="examples">
                    {examples.map((example, index) => (
                      <button
                        key={example.title}
                        disabled={!ready || busy}
                        onClick={() => {
                          setDraft(example.text);
                          input.current?.focus();
                        }}
                      >
                        <span className="example-index">0{index + 1}</span>
                        <span>{example.title}</span>
                        <span>↗</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {state.turns.map((turn) => (
                <div className="turn" key={turn.id}>
                  <article className="message user-message">
                    <div className="message-label">YOU</div>
                    <p>{turn.message}</p>
                  </article>
                  <article className="message assistant-message">
                    <div className="message-label">
                      <span className="mini-mark">✳</span> ENGINEERING BRIEF
                    </div>
                    <p>{turn.reply}</p>
                  </article>
                </div>
              ))}
              {submitted && (
                <div className="turn">
                  <article className="message user-message">
                    <div className="message-label">YOU</div>
                    <p>{submitted}</p>
                  </article>
                  <div className="thinking">
                    <span className="pulse" /> Thinking through the details…
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
            {error && (
              <div role="alert" className="error-message">
                {error}
                {!ready && (
                  <button onClick={refresh} disabled={busy}>
                    Reconnect
                  </button>
                )}
              </div>
            )}
            <form className="composer" onSubmit={send}>
              <label className="sr-only" htmlFor="message">
                Your message
              </label>
              <textarea
                id="message"
                ref={input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={LIMITS.message}
                disabled={!ready || busy || state.turns.length >= LIMITS.turns}
                placeholder="Describe your idea, goals, and constraints…"
                rows={3}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  {state.turns.length >= LIMITS.turns
                    ? "Brief complete — export and start a new one."
                    : `${draft.length}/${LIMITS.message} · ⌘/Ctrl + Enter to send`}
                </span>
                <button
                  className="send-button"
                  type="submit"
                  disabled={
                    !ready ||
                    busy ||
                    !draft.trim() ||
                    state.turns.length >= LIMITS.turns
                  }
                >
                  {submitted ? "Thinking…" : "Send message"}
                  <span>↑</span>
                </button>
              </div>
            </form>
            <p className="chat-footnote">
              AI suggestions need your judgment. Only accepted tasks enter your
              plan.
            </p>
          </section>

          <aside className="plan-column">
            <section className="panel task-panel" aria-labelledby="steps-title">
              <div className="panel-heading">
                <div className="panel-title">
                  <span className="section-number">02</span>
                  <h2 id="steps-title">The next steps</h2>
                </div>
                <span className="task-count">{state.tasks.length}</span>
              </div>
              <div className="tabs" aria-label="Task views">
                <button
                  aria-pressed={view === "pending"}
                  onClick={() => setView("pending")}
                >
                  To review <span>{pending.length}</span>
                </button>
                <button
                  aria-pressed={view === "plan"}
                  onClick={() => setView("plan")}
                >
                  Your plan <span>{plan.length}</span>
                </button>
              </div>
              <div className="task-list">
                {tasks.length ? (
                  tasks.map((task, index) => (
                    <article
                      className={`task-card ${task.status === "done" ? "task-done" : ""}`}
                      key={task.id}
                    >
                      <div className="task-meta">
                        <span>STEP {String(index + 1).padStart(2, "0")}</span>
                        <span>
                          {task.status === "pending"
                            ? "For your review"
                            : task.status === "done"
                              ? "Completed ✓"
                              : "Accepted"}
                        </span>
                      </div>
                      <h3>{task.title}</h3>
                      <p>
                        <strong>Done when</strong>
                        {task.criteria}
                      </p>
                      <div className="task-actions">
                        {task.status === "pending" ? (
                          <>
                            <button
                              className="accept-button"
                              disabled={busy}
                              onClick={() => decide(task, "accepted")}
                            >
                              Accept step <span>＋</span>
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => decide(task, "dismissed")}
                            >
                              Dismiss
                            </button>
                          </>
                        ) : task.status === "accepted" ? (
                          <button
                            className="accept-button"
                            disabled={busy}
                            onClick={() => decide(task, "done")}
                          >
                            Mark complete <span>✓</span>
                          </button>
                        ) : (
                          <span className="completed-note">
                            A little more progress.
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-tasks">
                    <div className="empty-illustration">
                      <span />
                      <span />
                      <span />
                    </div>
                    <h3>
                      {view === "pending"
                        ? "Room for a good next step."
                        : "Your plan starts with a decision."}
                    </h3>
                    <p>
                      {view === "pending"
                        ? "As we talk, suggested tasks will appear here. Keep what helps. Dismiss what doesn’t."
                        : "Accept a suggested task to add it here. Then mark it complete as you build."}
                    </p>
                  </div>
                )}
              </div>
            </section>
            <section className="progress-card">
              <div>
                <p className="eyebrow">SMALL STEPS, REAL PROGRESS</p>
                <span className="progress-number">
                  {done}
                  <span> / {plan.length}</span>
                </span>
                <p>accepted steps completed</p>
              </div>
              <div className="progress-track">
                <div
                  style={{
                    width: `${plan.length ? (done / plan.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </section>
            <div className="note">
              <span>↳</span>
              <p>
                <strong>Your brief remembers.</strong> Come back in this browser
                to pick up where you left off. Up to 24 turns per brief.
              </p>
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <span>THINK CLEARLY. BUILD DELIBERATELY.</span>
          <span>Workers AI · Durable memory · Human decisions</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
