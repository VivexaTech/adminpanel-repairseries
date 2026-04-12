import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { sendSupportMessage, subscribeChatMessages } from '../services/firestore'

const formatTs = (ts) => {
  if (!ts?.toDate) return '--'
  return format(ts.toDate(), 'dd MMM yyyy, hh:mm a')
}

export function SupportPage() {
  const { supportChats, loading, markSupportChatRead, supportUnreadTotal } = useApp()
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const listEndRef = useRef(null)

  const selectedChat = useMemo(
    () => supportChats.find((c) => c.id === selectedId) || null,
    [supportChats, selectedId],
  )

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setMessagesLoading(false)
      setMessagesError('')
      return undefined
    }
    setMessagesLoading(true)
    setMessagesError('')
    const unsub = subscribeChatMessages(
      selectedId,
      (rows) => {
        setMessages(rows)
        setMessagesLoading(false)
        setMessagesError('')
      },
      (err) => {
        console.error('[SupportPage] messages listener', err)
        setMessagesLoading(false)
        setMessagesError('Could not load messages.')
        toast.error('Could not load messages.')
      },
    )
    return () => unsub()
  }, [selectedId])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedId])

  const openChat = (chat) => {
    setSelectedId(chat.id)
    const lastAt = chat.lastMessageAt?.toMillis?.() ?? Date.now()
    markSupportChatRead(chat.id, lastAt)
  }

  const sendReply = async (event) => {
    event.preventDefault()
    if (!selectedId || !reply.trim()) return
    setSending(true)
    try {
      await sendSupportMessage(selectedId, { message: reply.trim(), senderRole: 'admin' })
      setReply('')
      const now = Date.now()
      markSupportChatRead(selectedId, now)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSending(false)
    }
  }

  const getReadMillis = (chatId) => {
    try {
      return Number(localStorage.getItem(`repair-series-support-read-${chatId}`) || 0)
    } catch {
      return 0
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support / Chats"
        description="Real-time customer support. Unread chats are highlighted."
        actions={
          supportUnreadTotal > 0 ? (
            <Badge tone="warning">{supportUnreadTotal} unread</Badge>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="max-h-[70vh] overflow-y-auto p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--on-surface)]">Conversations</h3>
          {loading.supportChats ? (
            <p className="text-sm text-[var(--on-surface-variant)]">Loading chats...</p>
          ) : null}
          {!loading.supportChats && !supportChats.length ? (
            <p className="text-sm text-[var(--on-surface-variant)]">
              No conversations yet. Chats appear here when documents exist under{' '}
              <code className="rounded bg-[var(--surface-high)] px-1 text-xs">supportChats</code> (for example after
              the first message).
            </p>
          ) : null}
          <div className="space-y-2">
            {supportChats.map((chat) => {
              const lastAt = chat.lastMessageAt?.toMillis?.() ?? 0
              const readAt = getReadMillis(chat.id)
              const unread = chat.lastSenderRole === 'user' && lastAt > readAt
              const title = chat.userName || chat.userId || 'Conversation'
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => openChat(chat)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedId === chat.id
                      ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'
                      : 'border-[var(--border)] bg-[var(--surface-lowest)] hover:bg-[var(--surface-low)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium text-[var(--on-surface)]">{title}</p>
                    {unread ? (
                      <span className="shrink-0 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--on-surface-variant)]">ID: {chat.id}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--on-surface-variant)]">
                    {chat.lastMessage || '(No messages yet)'}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--on-surface-variant)]">
                    {formatTs(chat.lastMessageAt)}
                  </p>
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="flex max-h-[70vh] flex-col p-0">
          {!selectedChat ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--on-surface-variant)]">
              Select a chat to view messages.
            </div>
          ) : (
            <>
              <div className="border-b border-[var(--border)] px-5 py-4">
                <h3 className="font-semibold text-[var(--on-surface)]">
                  {selectedChat.userName || selectedChat.userId || selectedChat.id}
                </h3>
                <p className="text-xs text-[var(--on-surface-variant)]">Chat ID: {selectedChat.id}</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messagesLoading ? (
                  <p className="py-6 text-center text-sm text-[var(--on-surface-variant)]">Loading messages…</p>
                ) : null}
                {messagesError && !messagesLoading ? (
                  <p className="py-6 text-center text-sm text-amber-800 dark:text-amber-200">{messagesError}</p>
                ) : null}
                {!messagesLoading && !messagesError && !messages.length ? (
                  <p className="py-6 text-center text-sm text-[var(--on-surface-variant)]">
                    No messages in this thread yet.
                  </p>
                ) : null}
                {messages.map((m) => {
                  const isAdmin = m.senderRole === 'admin'
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                          isAdmin
                            ? 'bg-[var(--primary)] text-white'
                            : 'border border-[var(--border)] bg-[var(--surface-low)] text-[var(--on-surface)]'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p
                          className={`mt-1 text-[10px] ${isAdmin ? 'text-white/80' : 'text-[var(--on-surface-variant)]'}`}
                        >
                          {formatTs(m.timestamp)}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={listEndRef} />
              </div>
              <form
                onSubmit={sendReply}
                className="border-t border-[var(--border)] p-4"
              >
                <Field label="Reply as admin">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type a message..."
                  />
                </Field>
                <div className="mt-3 flex justify-end">
                  <Button type="submit" disabled={sending || !reply.trim()}>
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
