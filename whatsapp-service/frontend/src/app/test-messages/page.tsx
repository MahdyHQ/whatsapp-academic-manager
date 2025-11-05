
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import Link from 'next/link';
import { api, APIError } from '../../lib/api/api';
import {
  ArrowLeft,
  Search,
  MessageSquare,
  User,
  Calendar,
  Loader2,
  InboxIcon,
  AlertCircle,
  Image as ImageIcon,
  Video,
  Mic,
  File,
  MapPin,
  UserPlus,
  BarChart3,
  Reply,
  Forward,
  Trash2,
  Music,
} from 'lucide-react';

interface Message {
  id: string;
  from_user: string;
  fromMe: boolean;
  messageType: string;
  content: string;
  caption?: string;
  timestamp: number;
  date: string;
  quotedMessage?: {
    participant: string;
    content: string;
  };
  mentionedJids?: string[];
  isForwarded?: boolean;
  isDeleted?: boolean;
  mediaInfo?: any;
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
      // Use the centralized API helper so headers (Bearer or x-api-key) are added automatically
      const data = await api.whatsapp.getMessages(id, 20);

      const msgs = (data && (data.messages || data)) || [];
      setMessages(msgs);
      setGroupName((data && (data.group_name || data.groupName)) || 'Unknown Group');

      if (!msgs || msgs.length === 0) {
        setError('No messages found in this group. The group might be empty or message history is not available yet.');
      }
    } catch (err: any) {
      if (err instanceof APIError) {
        // Surface server-provided error details when available
        setError(`Error ${err.status || ''} ${err.message}`.trim());
        console.error('API error:', err.data || err.message);
      } else {
        setError(`Failed to fetch messages: ${err?.message || String(err)}`);
        console.error('Fetch error:', err);
      }
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

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'voice':
        return <Mic className="w-4 h-4" />;
      case 'audio':
        return <Music className="w-4 h-4" />;
      case 'document':
        return <File className="w-4 h-4" />;
      case 'location':
        return <MapPin className="w-4 h-4" />;
      case 'contact':
        return <UserPlus className="w-4 h-4" />;
      case 'poll':
        return <BarChart3 className="w-4 h-4" />;
      case 'deleted':
        return <Trash2 className="w-4 h-4 text-red-500" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getMessageTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'image':
        return 'bg-purple-100 text-purple-700';
      case 'video':
        return 'bg-pink-100 text-pink-700';
      case 'voice':
      case 'audio':
        return 'bg-green-100 text-green-700';
      case 'document':
        return 'bg-orange-100 text-orange-700';
      case 'location':
        return 'bg-red-100 text-red-700';
      case 'contact':
        return 'bg-cyan-100 text-cyan-700';
      case 'poll':
        return 'bg-indigo-100 text-indigo-700';
      case 'deleted':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-blue-100 text-blue-700';
    }
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
                  <Card 
                    key={message.id} 
                    className={`border-l-4 ${
                      message.fromMe 
                        ? 'border-green-500 bg-green-50' 
                        : message.isDeleted
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-blue-500'
                    }`}
                  >
                    <CardContent className="pt-4">
                      {/* Header with user and metadata */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-500" />
                              {formatPhone(message.from_user)}
                            </p>
                            {message.fromMe && (
                              <Badge variant="secondary" className="text-xs">
                                You
                              </Badge>
                            )}
                            <Badge 
                              variant="outline" 
                              className={`text-xs flex items-center gap-1 ${getMessageTypeBadgeColor(message.messageType)}`}
                            >
                              {getMessageTypeIcon(message.messageType)}
                              {message.messageType}
                            </Badge>
                            {message.isForwarded && (
                              <Badge variant="outline" className="text-xs flex items-center gap-1 bg-amber-100 text-amber-700">
                                <Forward className="w-3 h-3" />
                                Forwarded
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            {message.date}
                          </p>
                        </div>
                        <Badge variant="outline">#{index + 1}</Badge>
                      </div>

                      {/* Quoted Message */}
                      {message.quotedMessage && (
                        <div className="mb-3 p-2 bg-gray-100 border-l-2 border-gray-400 rounded text-xs">
                          <div className="flex items-center gap-1 text-gray-600 mb-1">
                            <Reply className="w-3 h-3" />
                            <span className="font-semibold">
                              Replying to {formatPhone(message.quotedMessage.participant)}
                            </span>
                          </div>
                          <p className="text-gray-700 italic">
                            {message.quotedMessage.content}
                          </p>
                        </div>
                      )}

                      {/* Main Content */}
                      <div className="mt-2">
                        <p className={`text-sm whitespace-pre-wrap p-3 rounded-lg ${
                          message.isDeleted 
                            ? 'bg-gray-100 text-gray-500 italic' 
                            : 'bg-white text-gray-700'
                        }`}>
                          {message.content}
                        </p>
                        
                        {/* Caption for media */}
                        {message.caption && message.caption !== message.content && (
                          <p className="text-xs text-gray-600 mt-2 italic">
                            Caption: {message.caption}
                          </p>
                        )}
                      </div>

                      {/* Media Info */}
                      {message.mediaInfo && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-xs font-semibold text-blue-900 mb-2">Media Details:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                            {message.mediaInfo.mimetype && (
                              <div>
                                <span className="font-semibold">Type:</span> {message.mediaInfo.mimetype}
                              </div>
                            )}
                            {message.mediaInfo.fileSize && (
                              <div>
                                <span className="font-semibold">Size:</span> {(message.mediaInfo.fileSize / 1024 / 1024).toFixed(2)} MB
                              </div>
                            )}
                            {message.mediaInfo.duration && (
                              <div>
                                <span className="font-semibold">Duration:</span> {message.mediaInfo.duration}s
                              </div>
                            )}
                            {message.mediaInfo.width && message.mediaInfo.height && (
                              <div>
                                <span className="font-semibold">Dimensions:</span> {message.mediaInfo.width}x{message.mediaInfo.height}
                              </div>
                            )}
                            {message.mediaInfo.fileName && (
                              <div className="col-span-2">
                                <span className="font-semibold">File:</span> {message.mediaInfo.fileName}
                              </div>
                            )}
                            {message.mediaInfo.latitude && message.mediaInfo.longitude && (
                              <>
                                <div className="col-span-2">
                                  <span className="font-semibold">Coordinates:</span> {message.mediaInfo.latitude}, {message.mediaInfo.longitude}
                                </div>
                                {message.mediaInfo.name && (
                                  <div className="col-span-2">
                                    <span className="font-semibold">Place:</span> {message.mediaInfo.name}
                                  </div>
                                )}
                                {message.mediaInfo.address && (
                                  <div className="col-span-2">
                                    <span className="font-semibold">Address:</span> {message.mediaInfo.address}
                                  </div>
                                )}
                              </>
                            )}
                            {message.mediaInfo.displayName && (
                              <div className="col-span-2">
                                <span className="font-semibold">Contact:</span> {message.mediaInfo.displayName}
                              </div>
                            )}
                            {message.mediaInfo.name && message.messageType === 'poll' && (
                              <>
                                <div className="col-span-2">
                                  <span className="font-semibold">Poll Question:</span> {message.mediaInfo.name}
                                </div>
                                <div className="col-span-2">
                                  <span className="font-semibold">Options:</span>
                                  <ul className="list-disc list-inside mt-1">
                                    {message.mediaInfo.options?.map((opt: string, i: number) => (
                                      <li key={i}>{opt}</li>
                                    ))}
                                  </ul>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Mentions */}
                      {message.mentionedJids && message.mentionedJids.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          <span className="font-semibold">Mentions:</span> {message.mentionedJids.map(formatPhone).join(', ')}
                        </div>
                      )}
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