'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/src/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Clock, Sparkles } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface Note {
  id: string;
  content: string;
  created_at: string;
}

export default function NotesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    // Always set loading to false after a short delay to prevent hanging
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 500);

    const fetchNotes = async () => {
      try {
        // Use schema-qualified table name with proper format
        const { data, error } = await supabase
          .schema('test')
          .from('notes')
          .select('id, content, created_at')
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Supabase query error:', error);
          if (mounted) {
            setError(error.message || 'Failed to fetch notes. Please check your Supabase configuration.');
          }
        } else {
          if (mounted) {
            setNotes(data || []);
            setError(null);
          }
        }
      } catch (err) {
        console.error('Fetch notes error:', err);
        if (mounted) {
          setError('Failed to fetch notes. Please check your Supabase configuration.');
        }
      }
    };

    // Try to get session, but don't wait for it
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          setSession(session);
          setLoading(false);
          clearTimeout(timeout);
          if (session) {
            fetchNotes();
          }
        }
      })
      .catch(() => {
        // Ignore errors - just show login prompt
        if (mounted) {
          setLoading(false);
          clearTimeout(timeout);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        if (session) {
          fetchNotes();
        } else {
          setNotes([]);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content.length > 280) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error } = await supabase
        .schema('test')
        .from('notes')
        .insert({ content: content.trim() });

      if (error) {
        console.error('Supabase insert error:', error);
        setError(error.message || 'Failed to create note. Please check your Supabase configuration.');
      } else {
        setContent('');
        // Refetch notes
        const { data, error: fetchError } = await supabase
          .schema('test')
          .from('notes')
          .select('id, content, created_at')
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setNotes(data || []);
        }
      }
    } catch (err) {
      console.error('Create note error:', err);
      setError('Failed to create note. Please check your Supabase configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Alert className="max-w-md">
          <AlertDescription>
            You must be logged in to view notes.{' '}
            <Link href="/login" className="underline font-medium">
              Login here
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Notes
          </h1>
          <p className="text-gray-600 mt-2 text-lg">Manage your personal notes</p>
        </div>
        <Badge variant="outline" className="text-sm px-4 py-2">
          <FileText className="h-4 w-4 mr-2" />
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </Badge>
      </div>

      <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-white">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Add Note</CardTitle>
              <CardDescription>Create a new note (max 280 characters)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={280}
              disabled={submitting}
              className="h-12 text-lg"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${
                  content.length > 250 ? 'text-red-500' : 
                  content.length > 200 ? 'text-orange-500' : 
                  'text-gray-500'
                }`}>
                  {content.length}/280
                </span>
                {content.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {280 - content.length} left
                  </Badge>
                )}
              </div>
              <Button 
                type="submit" 
                disabled={submitting || !content.trim()}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all"
              >
                {submitting ? 'Adding...' : 'Add Note'}
              </Button>
            </div>
          </form>
          {error && (
            <Alert className="mt-4 border-red-500 bg-red-50 dark:bg-red-950">
              <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Recent Notes</h2>
          {notes.length > 0 && (
            <Badge variant="secondary" className="text-sm">
              Latest first
            </Badge>
          )}
        </div>
        {notes.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700">
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                No notes yet
              </p>
              <p className="text-sm text-gray-500">
                Create your first note above to get started!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map((note, index) => (
              <Card 
                key={note.id} 
                className="border-0 shadow-md hover:shadow-xl transition-all hover:scale-[1.02] group"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
                        {note.content}
                      </p>
                    </div>
                    <Badge 
                      variant="outline" 
                      className="ml-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      #{index + 1}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

