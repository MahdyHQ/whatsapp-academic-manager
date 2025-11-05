
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  MessageSquare,
  User,
  Calendar,
  Loader2,
  InboxIcon,
  AlertCircle,
} from 'lucide-react';

interface Message {
  id: string;
  from_user: string;
  content: string;
  timestamp: number;
  date: string;
}

function TestMessagesInner() {
  const searchParams = useSearchParams();
  const [groupId, setGroupId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    const urlGroupId = searchParams.get('groupId');
    if (urlGroupId) {
      setGroupId(urlGroupId);
      fetchMessagesFromUrl(urlGroupId);
    }
  }, [searchParams]);

  const fetchMessagesFromUrl = async (id: string) => {
    if (!id.trim()) {
      setError('Please enter a group ID');
      return;
    }

    setLoading(true);
    setError('');
    setMessages([]);

    try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/whatsapp/messages/${id}?limit=20`
        );

        // Try to read body even on non-OK so we can surface server error details
        let data: any = null;
        try {
          const text = await response.text();
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            // response was not JSON
            data = { text };
          }
        } catch (e) {
          // ignore body parse errors
          data = null;
        }

        if (!response.ok) {
          const serverMsg = data?.error || data?.detail || data?.message || data?.text || response.statusText;
          if (response.status >= 500) {
            // Server-side error — show a friendly message but include server text if available
            setError(`Server error (${response.status}). ${serverMsg || 'Please try again later.'}`);
          } else {
            setError(`Error ${response.status}: ${serverMsg || response.statusText}`);
          }
          console.error('Fetch error:', { status: response.status, body: data });
          return;
        }

        // Successful response — if we parsed JSON into `data`, use it; otherwise try parse again
        if (!data) {
          try {
            data = await response.json();
          } catch (e) {
            data = null;
          }
        }

        const msgs = (data && (data.messages || data)) || [];
        setMessages(msgs);
        setGroupName((data && (data.group_name || data.groupName)) || 'Unknown Group');

        if (!msgs || msgs.length === 0) {
          setError('No messages found in this group');
        }
    } catch (err: any) {
      setError(`Failed to fetch messages: ${err.message}`);
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = () => {
    fetchMessagesFromUrl(groupId);
  };

  const formatPhone = (phone: string) => {
    const match = phone.match(/(\d+)/);
    return match ? `+${match[1]}` : phone;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
              <MessageSquare className="w-10 h-10 text-blue-600" />
              Test Message Fetching
            </h1>
            <p className="text-gray-600 mt-2">
              Enter a group ID to fetch and display messages
            </p>
          </div>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Input Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Enter Group ID
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Example: 123456789@g.us"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchMessages()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button 
                onClick={fetchMessages} 
                disabled={loading || !groupId.trim()}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Fetch Messages
                  </>
                )}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="mb-2 flex items-center gap-2">
                <InboxIcon className="w-4 h-4" />
                <strong>How to get Group ID:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-6">
                <li>
                  <Link
                    href="/groups"
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    Go to Groups Page
                  </Link>
                </li>
                <li>Click "View Messages" on any group</li>
                <li>Or copy the group ID from the groups list</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {messages.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-6 h-6 text-blue-600" />
                    Messages from: {groupName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Group ID: {groupId}
                  </p>
                </div>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  {messages.length} messages
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {messages.map((message, index) => (
                  <Card key={message.id} className="border-l-4 border-blue-500">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            {formatPhone(message.from_user)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            {message.date}
                          </p>
                        </div>
                        <Badge variant="outline">#{index + 1}</Badge>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2 p-3 bg-gray-50 rounded-lg">
                        {message.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Fetching messages from WhatsApp...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Results */}
        {!loading && !error && messages.length === 0 && groupId && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <InboxIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg mb-2">No messages found</p>
              <p className="text-sm">Try fetching from a different group</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function TestMessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 p-8">Loading…</div>}>
      <TestMessagesInner />
    </Suspense>
  );
}