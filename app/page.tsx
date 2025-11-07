'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Users, Zap, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/src/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [noteCount, setNoteCount] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        supabase
          .schema('test')
          .from('notes')
          .select('id', { count: 'exact', head: true })
          .then(({ count }) => {
            setNoteCount(count || 0);
          });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        supabase
          .schema('test')
          .from('notes')
          .select('id', { count: 'exact', head: true })
          .then(({ count }) => {
            setNoteCount(count || 0);
          });
      } else {
        setNoteCount(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const stats = [
    {
      title: 'Total Notes',
      value: noteCount.toString(),
      change: noteCount > 0 ? `+${noteCount}` : '0',
      trend: 'up',
      icon: FileText,
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Active Users',
      value: '1',
      change: '+100%',
      trend: 'up',
      icon: Users,
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Performance',
      value: '99%',
      change: '+5%',
      trend: 'up',
      icon: Zap,
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Growth',
      value: '↑',
      change: '+12%',
      trend: 'up',
      icon: TrendingUp,
      gradient: 'from-orange-500 to-red-500',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-gray-600 mt-2 text-lg">Welcome to the Metagapura Portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <Badge 
                      variant={stat.trend === 'up' ? 'default' : 'destructive'}
                      className="mt-2 bg-green-500 hover:bg-green-600"
                    >
                      {stat.change}
                    </Badge>
                  </div>
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} text-white`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Welcome Card */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">Welcome back! 👋</h2>
              <p className="text-gray-600 mb-4">
                Get started by creating your first note or exploring the features.
              </p>
              <div className="flex gap-4">
                <Link href="/notes">
                  <button className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all hover:scale-105">
                    Go to Notes
                  </button>
                </Link>
              </div>
            </div>
            <div className="hidden md:block ml-8">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 opacity-20 blur-3xl"></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Create Notes</h3>
                <p className="text-sm text-gray-600">Start organizing your thoughts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Quick Access</h3>
                <p className="text-sm text-gray-600">Everything you need in one place</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


