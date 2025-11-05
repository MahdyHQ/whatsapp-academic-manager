'use client';

import { useState } from 'react';
import { useWhatsAppGroups, useGroupMessages } from '../../lib/hooks/use-whatsapp';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Loader2,
  InboxIcon,
  Search,
  RefreshCw,
  AlertCircle,
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
  quotedMessage?: any;
  mentionedJids?: string[];
  isForwarded?: boolean;
  isDeleted?: boolean;
  mediaInfo?: any;
}

export default function MessagesPage() {
  const { data: groupsData, isLoading: groupsLoading } = useWhatsAppGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  
  // Fetch up to 100 messages per group (increased from 50)
  const { 
    data: messagesData, 
    isLoading: loading, 
    error: messagesError,
    refetch 
  } = useGroupMessages(selectedGroupId, 100);

  const groups = groupsData?.groups || [];
  const messages = messagesData?.messages || [];
  const groupName = messagesData?.group_name || messagesData?.groupName || 'Unknown Group';
  const error = messagesError ? `Error loading messages: ${messagesError}` : '';

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const formatPhone = (phone: string) => {
    const match = phone.match(/(\d+)/);
    return match ? `+${match[1]}` : phone;
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'document': return '📄';
      case 'sticker': return '😀';
      default: return '💬';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
              <MessageSquare className="w-10 h-10 text-blue-600" />
              Messages Viewer
            </h1>
            <p className="text-gray-600 mt-2">
              Select a group to view all available messages
            </p>
          </div>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Automatic Message Fetching</p>
            <p>
              Messages are automatically fetched from WhatsApp when you select a group. 
              No manual syncing required - the system retrieves all available messages from the chat history.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Groups Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Select Group
                </CardTitle>
              </CardHeader>
              <CardContent>
                {groupsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {groups.slice(0, 20).map((group : any) => (
                      <button
                        key={group.id}
                        onClick={() => handleGroupSelect(group.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedGroupId === group.id
                            ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200'
                            : 'hover:bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="font-medium text-sm line-clamp-1">
                          {group.name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <Users className="w-3 h-3" />
                          {group.participants} members
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!groupsLoading && groups.length > 20 && (
                  <div className="mt-4 text-center">
                    <Link href="/groups">
                      <Button variant="outline" size="sm" className="w-full">
                        <Search className="w-4 h-4 mr-2" />
                        View All {groups.length} Groups
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Messages Area */}
          <div className="lg:col-span-2">
            {!selectedGroupId && !loading ? (
              <Card className="h-full flex items-center justify-center min-h-[400px]">
                <CardContent className="text-center">
                  <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-600 mb-2">
                    No Group Selected
                  </p>
                  <p className="text-gray-500">
                    Select a group from the sidebar to view messages
                  </p>
                </CardContent>
              </Card>
            ) : loading ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
                    <p className="text-gray-600">Fetching messages from WhatsApp...</p>
                    <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
                  </div>
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                  <p className="text-red-600 font-semibold mb-2">Failed to Load Messages</p>
                  <p className="text-red-500 text-sm mb-4">{error}</p>
                  <Button
                    onClick={() => refetch()}
                    className="mt-4"
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : messages.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-blue-600" />
                        {groupName}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {messages.length} messages retrieved
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-lg px-4 py-2">
                        {messages.length}
                      </Badge>
                      <Button
                        onClick={() => refetch()}
                        variant="outline"
                        size="sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {messages.map((message: Message, index: number) => (
                      <Card
                        key={message.id}
                        className={`border-l-4 hover:shadow-md transition-shadow ${
                          message.fromMe 
                            ? 'border-green-500 bg-green-50/50' 
                            : 'border-blue-500'
                        }`}
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getMessageTypeIcon(message.messageType)}</span>
                                <p className="font-semibold text-sm">
                                  {message.fromMe ? 'You' : formatPhone(message.from_user)}
                                </p>
                                {message.messageType !== 'text' && (
                                  <Badge variant="outline" className="text-xs">
                                    {message.messageType}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {message.date}
                              </p>
                            </div>
                            <Badge variant="outline">#{index + 1}</Badge>
                          </div>
                          
                          {/* Message Content */}
                          {message.content && (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2 p-3 bg-gray-50 rounded-lg">
                              {message.content}
                            </p>
                          )}
                          
                          {/* Caption for media */}
                          {message.caption && (
                            <p className="text-sm text-gray-600 italic mt-2 p-2 bg-gray-100 rounded">
                              Caption: {message.caption}
                            </p>
                          )}
                          
                          {/* Additional Info */}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {message.isForwarded && (
                              <Badge variant="secondary" className="text-xs">
                                ↪️ Forwarded
                              </Badge>
                            )}
                            {message.isDeleted && (
                              <Badge variant="destructive" className="text-xs">
                                🗑️ Deleted
                              </Badge>
                            )}
                            {message.quotedMessage && (
                              <Badge variant="secondary" className="text-xs">
                                💬 Reply
                              </Badge>
                            )}
                            {message.mentionedJids && message.mentionedJids.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                @ {message.mentionedJids.length} mentions
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <InboxIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-600 mb-2">
                    No Messages Found
                  </p>
                  <p className="text-gray-500 mb-4">
                    This group has no messages in the chat history
                  </p>
                  <Button
                    onClick={() => refetch()}
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}