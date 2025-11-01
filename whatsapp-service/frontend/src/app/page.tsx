import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              📱 Academic Manager
            </h1>
            <p className="text-xl text-gray-600">
              AI-Powered WhatsApp Academic Management System
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="flex items-center gap-2 bg-green-100 px-4 py-2 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-700">
                  WhatsApp Connected: +201155547529
                </span>
              </div>
            </div>
          </div>

          {/* Main Action Card */}
          <Card className="border-2 border-blue-200 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                🚀 Step 1: Messages Display
              </CardTitle>
              <CardDescription className="text-base">
                View and test WhatsApp message fetching from your connected groups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/messages">
                <Button size="lg" className="w-full text-lg py-6">
                  Open Messages Display →
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Coming Soon Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="opacity-60">
              <CardHeader>
                <CardTitle className="text-lg">🎯 8-Tier Priority System</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Color-coded priority management (Coming in Step 3)
                </p>
                <Button disabled className="w-full">Coming Soon</Button>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardHeader>
                <CardTitle className="text-lg">🎓 Student Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Add, edit, and manage students (Coming in Step 4)
                </p>
                <Button disabled className="w-full">Coming Soon</Button>
              </CardContent>
            </Card>
          </div>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle>📊 System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <StatusRow label="WhatsApp Service" status="connected" />
                <StatusRow label="Backend API" status="running" />
                <StatusRow label="Frontend" status="active" />
                <StatusRow label="Database" status="pending" />
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p>Built by MahdyHQ | October 2025 Edition</p>
            <p>Current Time (UTC): {new Date().toISOString().replace('T', ' ').substring(0, 19)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const statusConfig = {
    connected: { color: 'text-green-600', icon: '✅', text: 'Connected' },
    running: { color: 'text-green-600', icon: '✅', text: 'Running' },
    active: { color: 'text-blue-600', icon: '🚀', text: 'Active' },
    pending: { color: 'text-yellow-600', icon: '⏳', text: 'Pending' },
  };

  const config = statusConfig[status as keyof typeof statusConfig];

  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0">
      <span className="text-gray-600 font-medium">{label}</span>
      <span className={`font-semibold ${config.color}`}>
        {config.icon} {config.text}
      </span>
    </div>
  );
}