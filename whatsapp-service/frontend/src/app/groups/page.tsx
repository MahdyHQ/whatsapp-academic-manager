'use client';

import { useState, useMemo } from 'react';
import { useWhatsAppGroups } from '../../lib/hooks/use-whatsapp';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import Link from 'next/link';
import {
  Users,
  Search,
  RefreshCw,
  ArrowLeft,
  Grid3x3,
  List,
  ArrowUpDown,
  CheckCircle2,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Crown,
} from 'lucide-react';

type Group = { id: string; name: string; participants: number };

export default function GroupsPage() {
  const { data, isLoading, error, refetch } = useWhatsAppGroups();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'participants'>('participants');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [filterSize, setFilterSize] = useState<'all' | 'small' | 'medium' | 'large'>('all');

  const groups: Group[] = (data?.groups as Group[]) || [];

  // Filter and sort groups
  const filteredGroups = useMemo(() => {
    let filtered = groups.filter((group: Group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filterSize !== 'all') {
      filtered = filtered.filter((group: Group) => {
        if (filterSize === 'small') return group.participants < 50;
        if (filterSize === 'medium') return group.participants >= 50 && group.participants < 200;
        if (filterSize === 'large') return group.participants >= 200;
        return true;
      });
    }

    filtered.sort((a: Group, b: Group) => {
      const aValue = sortBy === 'name' ? a.name : a.participants;
      const bValue = sortBy === 'name' ? b.name : b.participants;

      if (sortBy === 'name') {
        return sortOrder === 'asc'
          ? (aValue as string).localeCompare(bValue as string)
          : (bValue as string).localeCompare(aValue as string);
      } else {
        return sortOrder === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

    return filtered;
  }, [groups, searchQuery, sortBy, sortOrder, filterSize]);

  // Statistics
  const stats = useMemo(() => {
    const totalMembers = groups.reduce((sum: number, g: Group) => sum + g.participants, 0);
    const avgMembers = groups.length > 0 ? Math.round(totalMembers / groups.length) : 0;
    const largestGroup = groups.reduce((max: number, g: Group) => (g.participants > max ? g.participants : max), 0);

    return {
      total: groups.length,
      totalMembers,
      avgMembers,
      largestGroup,
    };
  }, [groups]);

  const toggleGroupSelection = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const selectAll = () => {
    if (selectedGroups.size === filteredGroups.length) {
      setSelectedGroups(new Set());
    } else {
  setSelectedGroups(new Set(filteredGroups.map((g: Group) => g.id)));
    }
  };

  const getGroupSize = (participants: number) => {
    if (participants < 50) return { label: 'Small', color: 'bg-blue-100 text-blue-700 border-blue-300' };
    if (participants < 200) return { label: 'Medium', color: 'bg-green-100 text-green-700 border-green-300' };
    return { label: 'Large', color: 'bg-purple-100 text-purple-700 border-purple-300' };
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-red-600 mb-4">❌ Failed to load groups</p>
                <Button onClick={() => refetch()}>Retry</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="w-10 h-10 text-blue-600" />
              WhatsApp Groups
            </h1>
            <p className="text-gray-600 mt-2">
              Manage and monitor your {groups.length} WhatsApp groups
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
        </div>

        {/* Statistics Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4" />
                  Total Groups
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Total Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalMembers.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Avg Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.avgMembers}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                  <Crown className="w-4 h-4" />
                  Largest Group
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.largestGroup}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search groups by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterSize === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterSize('all')}
                  size="sm"
                >
                  All Sizes
                </Button>
                <Button
                  variant={filterSize === 'small' ? 'default' : 'outline'}
                  onClick={() => setFilterSize('small')}
                  size="sm"
                >
                  Small (&lt;50)
                </Button>
                <Button
                  variant={filterSize === 'medium' ? 'default' : 'outline'}
                  onClick={() => setFilterSize('medium')}
                  size="sm"
                >
                  Medium (50-200)
                </Button>
                <Button
                  variant={filterSize === 'large' ? 'default' : 'outline'}
                  onClick={() => setFilterSize('large')}
                  size="sm"
                >
                  Large (200+)
                </Button>

                <div className="border-l mx-2"></div>

                <Button
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  onClick={() => setSortBy('name')}
                  size="sm"
                >
                  <List className="w-4 h-4 mr-1" />
                  By Name
                </Button>
                <Button
                  variant={sortBy === 'participants' ? 'default' : 'outline'}
                  onClick={() => setSortBy('participants')}
                  size="sm"
                >
                  <BarChart3 className="w-4 h-4 mr-1" />
                  By Members
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  size="sm"
                >
                  <ArrowUpDown className="w-4 h-4 mr-1" />
                  {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                </Button>

                <div className="border-l mx-2"></div>

                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  onClick={() => setViewMode('grid')}
                  size="sm"
                >
                  <Grid3x3 className="w-4 h-4 mr-1" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  onClick={() => setViewMode('list')}
                  size="sm"
                >
                  <List className="w-4 h-4 mr-1" />
                  List
                </Button>
              </div>

              {/* Selection Actions */}
              {selectedGroups.size > 0 && (
                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">
                    {selectedGroups.size} group{selectedGroups.size !== 1 ? 's' : ''} selected
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedGroups(new Set())}>
                    Clear Selection
                  </Button>
                  <Button size="sm">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Fetch All Messages
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            Showing <strong>{filteredGroups.length}</strong> of <strong>{groups.length}</strong> groups
          </p>
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {selectedGroups.size === filteredGroups.length ? 'Deselect All' : 'Select All'}
          </Button>
        </div>

        {/* Groups Display */}
        {isLoading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((group: Group) => {
              const size = getGroupSize(group.participants);
              const isSelected = selectedGroups.has(group.id);

              return (
                <Card
                  key={group.id}
                  className={`hover:shadow-lg transition-all cursor-pointer ${
                    isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => toggleGroupSelection(group.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-2 flex-1">
                        {group.name}
                      </CardTitle>
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-500" />
                        <span className="font-bold text-2xl">{group.participants}</span>
                      </div>
                      <Badge className={`${size.color} border font-semibold`}>{size.label}</Badge>
                    </div>
                    <Link href={`/test-messages?groupId=${encodeURIComponent(group.id)}`}>
                      <Button 
                        className="w-full" 
                        size="sm" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        View Messages
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map((group: Group) => {
              const size = getGroupSize(group.participants);
              const isSelected = selectedGroups.has(group.id);

              return (
                <Card
                  key={group.id}
                  className={`hover:shadow-md transition-all cursor-pointer ${
                    isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => toggleGroupSelection(group.id)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate text-lg">{group.name}</h3>
                          <p className="text-xs text-gray-500 truncate">ID: {group.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-gray-500" />
                          <span className="font-bold text-xl">{group.participants}</span>
                        </div>
                        <Badge className={`${size.color} border font-semibold`}>{size.label}</Badge>
                        <Link href={`/test-messages?groupId=${encodeURIComponent(group.id)}`}>
                          <Button size="sm" onClick={(e) => e.stopPropagation()}>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            View Messages
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* No Results */}
        {!isLoading && filteredGroups.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg mb-2">No groups found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}