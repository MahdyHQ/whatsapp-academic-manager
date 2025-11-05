import Link from 'next/link';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import {
  Smartphone,
  Zap,
  MessageSquare,
  Target,
  GraduationCap,
  Users,
  BarChart3,
  CheckCircle,
  Clock,
  Rocket,
  Phone,
  Activity,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center justify-center gap-3">
              <Smartphone className="w-12 h-12 text-blue-600" />
              Academic Manager
            </h1>
            <p className="text-xl text-gray-600">
              AI-Powered WhatsApp Academic Management System
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="flex items-center gap-2 bg-green-100 px-4 py-2 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <Phone className="w-4 h-4 text-green-700" />
                <span className="text-sm font-medium text-green-700">
                  WhatsApp Connected: +201155547529
                </span>
              </div>
            </div>
          </div>

          {/* Main Action Card */}
          <Card className="border-2 border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Rocket className="w-7 h-7 text-blue-600" />
                Step 1: Messages Display
              </CardTitle>
              <CardDescription className="text-base">
                View and test WhatsApp message fetching from your connected groups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/messages">
                <Button size="lg" className="w-full text-lg py-6 group">
                  <MessageSquare className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  Open Messages Display
                  <Zap className="w-5 h-5 ml-2 group-hover:scale-110 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Groups Management Card */}
          <Card className="border-2 border-green-200 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Users className="w-7 h-7 text-green-600" />
                Groups Management
              </CardTitle>
              <CardDescription className="text-base">
                View and manage all your 121 WhatsApp groups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/groups">
                <Button size="lg" className="w-full text-lg py-6 bg-green-600 hover:bg-green-700 group">
                  <Users className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  Manage Groups
                  <Zap className="w-5 h-5 ml-2 group-hover:scale-110 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Coming Soon Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="opacity-60 hover:opacity-80 transition-opacity">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-600" />
                  8-Tier Priority System
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Color-coded priority management (Coming in Step 3)
                </p>
                <Button disabled className="w-full">
                  <Clock className="w-4 h-4 mr-2" />
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

            <Card className="opacity-60 hover:opacity-80 transition-opacity">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  Student Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Add, edit, and manage students (Coming in Step 4)
                </p>
                <Button disabled className="w-full">
                  <Clock className="w-4 h-4 mr-2" />
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-blue-600" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <StatusRow 
                  label="WhatsApp Service" 
                  status="connected"
                  icon={<Phone className="w-4 h-4" />}
                />
                <StatusRow 
                  label="Backend API" 
                  status="running"
                  icon={<Activity className="w-4 h-4" />}
                />
                <StatusRow 
                  label="Frontend" 
                  status="active"
                  icon={<Rocket className="w-4 h-4" />}
                />
                <StatusRow 
                  label="Database" 
                  status="pending"
                  icon={<Clock className="w-4 h-4" />}
                />
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p className="flex items-center justify-center gap-2">
              <GraduationCap className="w-4 h-4" />
              Built by MahdyHQ | October 2025 Edition
            </p>
            <p className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              Current Time (UTC): {new Date().toISOString().replace('T', ' ').substring(0, 19)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ 
  label, 
  status,
  icon 
}: { 
  label: string; 
  status: string;
  icon: React.ReactNode;
}) {
  const statusConfig = {
    connected: { 
      color: 'text-green-600', 
      bgColor: 'bg-green-50',
      icon: <CheckCircle className="w-4 h-4" />, 
      text: 'Connected' 
    },
    running: { 
      color: 'text-green-600', 
      bgColor: 'bg-green-50',
      icon: <CheckCircle className="w-4 h-4" />, 
      text: 'Running' 
    },
    active: { 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-50',
      icon: <Rocket className="w-4 h-4" />, 
      text: 'Active' 
    },
    pending: { 
      color: 'text-yellow-600', 
      bgColor: 'bg-yellow-50',
      icon: <Clock className="w-4 h-4" />, 
      text: 'Pending' 
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig];

  return (
    <div className="flex justify-between items-center py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors">
      <span className="text-gray-700 font-medium flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className={`font-semibold flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor} ${config.color}`}>
        {config.icon}
        {config.text}
      </span>
    </div>
  );
}