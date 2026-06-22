"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select, Spinner, Badge } from "@/components/ui";
import { MODELS } from "@/lib/constants";

type GmailInfo = { status: string; email: string | null } | null;

const CLASSIFY_OPTIONS = [MODELS.classify, MODELS.chat];
const CHAT_OPTIONS = [
  { value: MODELS.chat, label: "Standard (faster, lower cost)" },
  { value: MODELS.chatPro, label: "Pro (deeper reasoning)" },
];

export default function SettingsClient({
  keyHint,
  classifyModel,
  chatModel,
  gmail,
}: {
  keyHint: string | null;
  classifyModel: string;
  chatModel: string;
  gmail: GmailInfo;
}) {
  const router = useRouter();

  const [geminiKey, setGeminiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [currentHint, setCurrentHint] = useState<string | null>(keyHint);

  const [classify, setClassify] = useState(classifyModel);
  const [chat, setChat] = useState(chatModel);
  const [savingModels, setSavingModels] = useState(false);
  const [modelMsg, setModelMsg] = useState<string | null>(null);

  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/gemini/test", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setTestMsg({
          ok: true,
          text: `Connected. Real Gemini is working (${data.classifyModel} + ${data.chatModel}).`,
        });
      } else {
        setTestMsg({
          ok: false,
          text: data.error || "Connection failed — check your key and model selection.",
        });
      }
    } catch {
      setTestMsg({ ok: false, text: "Could not reach the test endpoint." });
    } finally {
      setTesting(false);
    }
  }

  const connected = Boolean(gmail && gmail.status === "connected");

  async function saveKey() {
    setKeyMsg(null);
    if (!geminiKey.trim()) {
      setKeyMsg("Enter a key to save.");
      return;
    }
    setSavingKey(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemini_key: geminiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeyMsg(data?.error || "Could not save key.");
        return;
      }
      setCurrentHint(`****${geminiKey.trim().slice(-4)}`);
      setGeminiKey("");
      setKeyMsg("Key saved.");
    } catch {
      setKeyMsg("Could not save key.");
    } finally {
      setSavingKey(false);
    }
  }

  async function saveModels() {
    setModelMsg(null);
    setSavingModels(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classify_model: classify, chat_model: chat }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelMsg(data?.error || "Could not save models.");
        return;
      }
      setModelMsg("Models saved.");
      router.refresh();
    } catch {
      setModelMsg("Could not save models.");
    } finally {
      setSavingModels(false);
    }
  }

  async function disconnectGmail() {
    setDisconnecting(true);
    try {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  async function deleteAll() {
    const confirmed = window.confirm(
      "This permanently deletes all your scanned emails, classifications, case items, chats, and settings from CaseInbox. This cannot be undone. Continue?"
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your AI key, models, mailbox connection, and your data.
        </p>
      </header>

      {/* BYO Gemini key */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink">Your Gemini API key</h2>
        <p className="mt-1 text-sm text-slate-600">
          CaseInbox uses your own Google Gemini API key for classification and chat. For privacy,
          use a paid (non-training) configuration so your email content is not used to train models.
          Your key is encrypted at rest and never shown again after saving.
        </p>
        {currentHint && (
          <p className="mt-2 text-sm text-slate-600">
            Current key on file: <span className="font-mono text-slate-800">{currentHint}</span>
          </p>
        )}
        <div className="mt-3">
          <Label htmlFor="gemini-key">API key</Label>
          <Input
            id="gemini-key"
            type="password"
            autoComplete="off"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={currentHint ? "Enter a new key to replace the current one" : "Paste your Gemini API key"}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={saveKey} disabled={savingKey}>
            {savingKey ? <Spinner /> : null}
            Save key
          </Button>
          <Button variant="secondary" onClick={testConnection} disabled={testing}>
            {testing ? <Spinner /> : null}
            Test connection
          </Button>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand-700 underline"
          >
            Get a Gemini API key
          </a>
        </div>
        {keyMsg && <p className="mt-2 text-sm text-slate-600">{keyMsg}</p>}
        {testMsg && (
          <p className={`mt-2 text-sm ${testMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
            {testMsg.text}
          </p>
        )}
      </Card>

      {/* Model selectors */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink">Models</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose which Gemini models to use. Lighter models cost less; Pro reasons more deeply.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="classify-model">Classification model</Label>
            <Select
              id="classify-model"
              className="w-full"
              value={classify}
              onChange={(e) => setClassify(e.target.value)}
            >
              {CLASSIFY_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === MODELS.classify ? " (default)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="chat-model">Chat model</Label>
            <Select
              id="chat-model"
              className="w-full"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
            >
              {CHAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={saveModels} disabled={savingModels}>
            {savingModels ? <Spinner /> : null}
            Save models
          </Button>
          {modelMsg && <span className="text-sm text-slate-600">{modelMsg}</span>}
        </div>
      </Card>

      {/* Gmail connection */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink">Gmail connection</h2>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <Badge color="#16a34a">Connected</Badge>
                <span className="text-sm text-ink">{gmail?.email || "Gmail account"}</span>
              </>
            ) : (
              <Badge color="#64748b">Not connected</Badge>
            )}
          </div>
          {connected && (
            <Button variant="danger" size="sm" onClick={disconnectGmail} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">Access is read-only. Nothing is ever changed in your mailbox.</p>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200 p-5">
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-600">
          Permanently delete all of your CaseInbox data: scanned emails, AI classifications, case
          items, chats, and settings. This cannot be undone.
        </p>
        <Button className="mt-3" variant="danger" onClick={deleteAll} disabled={deleting}>
          {deleting ? <Spinner /> : null}
          Delete all my data
        </Button>
      </Card>
    </div>
  );
}
