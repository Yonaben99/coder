"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import type {
	AIConversationDetailDTO,
	AIConversationSummaryDTO,
	AIMessageDTO,
} from "@/lib/ai-client";
import { toolLabel } from "./tool-labels";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

const SUGGESTED_PROMPTS = [
	"What changed in my portfolio today?",
	"Why did my portfolio move?",
	"What are my biggest positions?",
	"What are my biggest risks?",
	"How concentrated am I?",
	"Compare my WDC and CLS exposure.",
	"How much cash do I have?",
	"What is my current technology exposure?",
	"Show me my biggest unrealized gains.",
];

function MessageBubble({ message }: { message: AIMessageDTO }) {
	if (
		message.role === "TOOL" ||
		(message.role === "ASSISTANT" &&
			!message.content &&
			message.toolCalls?.length)
	) {
		return null; // Internal tool-call plumbing — never shown as a chat bubble.
	}

	const isUser = message.role === "USER";
	const usedTools =
		message.role === "ASSISTANT"
			? (message.toolCalls?.map((t) => t.name) ?? [])
			: [];

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser ? "bg-[var(--color-accent-muted)] text-[var(--text-primary)]" : "bg-[var(--surface-raised)] text-[var(--text-primary)]"}`}
			>
				{usedTools.length > 0 && (
					<div className="mb-1.5 flex flex-wrap gap-1">
						{[...new Set(usedTools)].map((name) => (
							<span
								key={name}
								className="rounded-full bg-[var(--surface-overlay)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]"
							>
								{toolLabel(name)}
							</span>
						))}
					</div>
				)}
				<p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
					{message.content}
				</p>
			</div>
		</div>
	);
}

export function AIChat() {
	const [conversations, setConversations] = useState<
		AIConversationSummaryDTO[] | null
	>(null);
	const [conversationsError, setConversationsError] = useState<string | null>(
		null,
	);
	const [activeConversation, setActiveConversation] =
		useState<AIConversationDetailDTO | null>(null);
	const [loadingConversation, setLoadingConversation] = useState(false);
	const [draft, setDraft] = useState("");
	const [sending, setSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);
	const [mobileListOpen, setMobileListOpen] = useState(false);
	const threadEndRef = useRef<HTMLDivElement>(null);

	const loadConversations = useCallback(async () => {
		try {
			const result = await apiClient.get<{
				conversations: AIConversationSummaryDTO[];
			}>("/api/v1/ai/conversations");
			setConversations(result.conversations);
		} catch (err) {
			setConversationsError(
				err instanceof ApiError ? err.message : "Failed to load conversations.",
			);
		}
	}, []);

	useEffect(() => {
		void loadConversations();
	}, [loadConversations]);

	useEffect(() => {
		threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [activeConversation?.messages.length]);

	async function openConversation(id: string) {
		setLoadingConversation(true);
		setMobileListOpen(false);
		try {
			const result = await apiClient.get<{
				conversation: AIConversationDetailDTO;
			}>(`/api/v1/ai/conversations/${id}`);
			setActiveConversation(result.conversation);
		} catch (err) {
			setSendError(
				err instanceof ApiError ? err.message : "Failed to load conversation.",
			);
		} finally {
			setLoadingConversation(false);
		}
	}

	function startNewConversation() {
		setActiveConversation(null);
		setMobileListOpen(false);
		setSendError(null);
	}

	async function sendMessage(content: string) {
		const trimmed = content.trim();
		if (!trimmed || sending) return;
		setSending(true);
		setSendError(null);
		setDraft("");

		try {
			let conversation = activeConversation;
			if (!conversation) {
				const created = await apiClient.post<{
					conversation: AIConversationSummaryDTO;
				}>("/api/v1/ai/conversations", {});
				conversation = { ...created.conversation, messages: [] };
				setActiveConversation(conversation);
			}

			const optimisticUserMessage: AIMessageDTO = {
				id: `pending-${Date.now()}`,
				conversationId: conversation.id,
				role: "USER",
				content: trimmed,
				toolCalls: null,
				createdAt: new Date().toISOString(),
			};
			setActiveConversation((prev) =>
				prev
					? { ...prev, messages: [...prev.messages, optimisticUserMessage] }
					: prev,
			);

			const result = await apiClient.post<{
				assistantMessage: string;
				toolCallsUsed: string[];
			}>(`/api/v1/ai/conversations/${conversation.id}/messages`, {
				content: trimmed,
			});

			const assistantMessage: AIMessageDTO = {
				id: `assistant-${Date.now()}`,
				conversationId: conversation.id,
				role: "ASSISTANT",
				content: result.assistantMessage,
				toolCalls: result.toolCallsUsed.map((name) => ({ id: name, name })),
				createdAt: new Date().toISOString(),
			};
			setActiveConversation((prev) =>
				prev
					? { ...prev, messages: [...prev.messages, assistantMessage] }
					: prev,
			);
			void loadConversations();
		} catch (err) {
			setSendError(
				err instanceof ApiError ? err.message : "Failed to send message.",
			);
		} finally {
			setSending(false);
		}
	}

	const visibleMessages =
		activeConversation?.messages.filter(
			(m) => m.role === "USER" || (m.role === "ASSISTANT" && m.content),
		) ?? [];

	return (
		<div className="flex h-[calc(100vh-8rem)] flex-col gap-4 md:h-[calc(100vh-4rem)] md:flex-row">
			{/* Desktop sidebar */}
			<aside className="hidden shrink-0 flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3 md:flex md:w-64">
				<ConversationList
					conversations={conversations}
					error={conversationsError}
					activeId={activeConversation?.id ?? null}
					onSelect={openConversation}
					onNew={startNewConversation}
				/>
			</aside>

			{/* Mobile conversation drawer */}
			{mobileListOpen && (
				<div className="fixed inset-0 z-30 flex flex-col bg-[var(--surface)] p-3 md:hidden">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-sm font-semibold text-[var(--text-primary)]">
							Conversations
						</span>
						<button
							type="button"
							onClick={() => setMobileListOpen(false)}
							className="text-sm text-[var(--text-secondary)]"
						>
							Close
						</button>
					</div>
					<ConversationList
						conversations={conversations}
						error={conversationsError}
						activeId={activeConversation?.id ?? null}
						onSelect={openConversation}
						onNew={startNewConversation}
					/>
				</div>
			)}

			<section className="flex flex-1 flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]">
				<div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-3 md:hidden">
					<button
						type="button"
						onClick={() => setMobileListOpen(true)}
						className="text-sm text-[var(--text-secondary)]"
					>
						☰ Conversations
					</button>
					<span className="truncate text-sm font-medium text-[var(--text-primary)]">
						{activeConversation?.title ?? "New conversation"}
					</span>
				</div>

				<div className="flex-1 overflow-y-auto p-4">
					{loadingConversation ? (
						<LoadingState label="Loading conversation…" />
					) : visibleMessages.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
							<span className="text-3xl" aria-hidden>
								💬
							</span>
							<p className="font-medium text-[var(--text-primary)]">
								Ask Portfolio AI
							</p>
							<p className="max-w-sm text-sm text-[var(--text-secondary)]">
								Ask about your positions, allocation, or account — Portfolio AI
								retrieves current data through real tools before answering, and
								says so plainly when something isn&rsquo;t available.
							</p>
							<div className="mt-2 flex flex-wrap justify-center gap-2">
								{SUGGESTED_PROMPTS.map((prompt) => (
									<button
										key={prompt}
										type="button"
										onClick={() => void sendMessage(prompt)}
										disabled={sending}
										className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
									>
										{prompt}
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							{visibleMessages.map((message) => (
								<MessageBubble key={message.id} message={message} />
							))}
							{sending && (
								<div className="flex justify-start">
									<div className="rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-tertiary)]">
										Portfolio AI is thinking…
									</div>
								</div>
							)}
							<div ref={threadEndRef} />
						</div>
					)}
				</div>

				{sendError && (
					<div className="px-4 pb-2">
						<ErrorState message={sendError} />
					</div>
				)}

				<form
					className="flex items-center gap-2 border-t border-[var(--border-subtle)] p-3"
					onSubmit={(event) => {
						event.preventDefault();
						void sendMessage(draft);
					}}
				>
					<input
						dir="auto"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder="Ask about your portfolio…"
						disabled={sending}
						className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:opacity-60"
					/>
					<button
						type="submit"
						disabled={sending || !draft.trim()}
						className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
					>
						Send
					</button>
				</form>
			</section>
		</div>
	);
}

function ConversationList({
	conversations,
	error,
	activeId,
	onSelect,
	onNew,
}: {
	conversations: AIConversationSummaryDTO[] | null;
	error: string | null;
	activeId: string | null;
	onSelect: (id: string) => void;
	onNew: () => void;
}) {
	return (
		<>
			<button
				type="button"
				onClick={onNew}
				className="mb-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]"
			>
				+ New conversation
			</button>
			<p className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
				Conversations
			</p>
			{error && (
				<p className="px-1 text-xs text-[var(--color-negative)]">{error}</p>
			)}
			{conversations === null && !error && (
				<p className="px-1 text-xs text-[var(--text-tertiary)]">Loading…</p>
			)}
			{conversations?.length === 0 && (
				<p className="rounded-md px-2 py-6 text-center text-xs text-[var(--text-tertiary)]">
					No conversations yet — ask a question to start one.
				</p>
			)}
			<div className="flex flex-1 flex-col gap-1 overflow-y-auto">
				{conversations?.map((conversation) => (
					<button
						key={conversation.id}
						type="button"
						onClick={() => onSelect(conversation.id)}
						className={`truncate rounded-md px-2 py-2 text-left text-sm ${
							activeId === conversation.id
								? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
								: "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)]"
						}`}
						dir="auto"
					>
						{conversation.title ?? "New conversation"}
					</button>
				))}
			</div>
		</>
	);
}
