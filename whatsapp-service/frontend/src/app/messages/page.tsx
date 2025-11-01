'use client';

import { useState } from 'react';
import { useWhatsAppGroups } from '@/lib/hooks/use-whatsapp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Loader2,
  InboxIcon,
  Search,
} from 'lucide-react';

interface Message {
  id: string;
  from_user: string;
  content: string;
  timestamp: number;
  date: string;
}

export default function MessagesPage() {
  const { data: groupsData, isLoading: groupsLoading } = useWhatsAppGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupName, setGroupName] = useState('');

  const groups = groupsData?.groups || [];

  const fetchMessages = async (groupId: string) => {
    if (!groupId) return;

    setLoading(true);
    setError('');
    setMessages([]);
    setSelectedGroupId(groupId);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/whatsapp/messages/${groupId}?limit=50`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
      setGroupName(data.group_name || 'Unknown Group');

      if (data.messages.length === 0) {
        setError('No messages found in this group');
      }
    } catch (err: any) {
      setError(`Error: ${err.message}`);
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone: string) => {
    const match = phone.match(/(\d+)/);
    return match ? `+${match[1]}` : phone;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
              <MessageSquare className="w-10 h-10 text-blue-600" />
              Messages Display
            </h1>
            <p className="text-gray-600 mt-2">
              Select a group to view messages
            </p>
          </div>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
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
                    {groups.slice(0, 20).map((group) => (
                      <button
                        key={group.id}
                        onClick={() => fetchMessages(group.id)}
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
                    <p className="text-gray-600">Loading messages...</p>
                  </div>
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-12 text-center">
                  <p className="text-red-600">{error}</p>
                  <Button
                    onClick={() => fetchMessages(selectedGroupId)}
                    className="mt-4"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : messages.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-blue-600" />
                        {groupName}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {messages.length} messages
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-lg px-4 py-2">
                      {messages.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {messages.map((message, index) => (
                      <Card
                        key={message.id}
                        className="border-l-4 border-blue-500 hover:shadow-md transition-shadow"
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold text-sm">
                                {formatPhone(message.from_user)}
                              </p>
                              <p className="text-xs text-muted-foreground">
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
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <InboxIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-600 mb-2">
                    No Messages
                  </p>
                  <p className="text-gray-500">
                    This group has no messages yet
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}