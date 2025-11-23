'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/src/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Clock, Sparkles, Brain, RefreshCw } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface Note {
  id: string;
  content: string;
  created_at: string;
}

interface SummaryResponse {
  summary: string;
  updatedAt?: string;
}

interface SummaryErrorResponse {
  error: string;
  rateLimited?: boolean;
  dailyLimitReached?: boolean;
  generationsUsed?: number;
  maxGenerations?: number;
}

export default function NotesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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

    const fetchExistingSummary = async () => {
      try {
        const { data, error } = await supabase
          .schema('test')
          .from('note_summaries')
          .select('summary')
          .maybeSingle(); // Use maybeSingle() to handle no rows gracefully

        if (error) {
          // Check for specific error codes
          if (error.code === 'PGRST116') {
            // PGRST116 = no rows returned - this is fine, no summary exists yet
            if (mounted) {
              setSummary(null);
            }
          } else {
            // Other errors (like 403) should be logged
            console.error('Error fetching summary:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            if (mounted) {
              setSummary(null);
            }
          }
        } else if (data?.summary) {
          if (mounted) {
            setSummary(data.summary);
            setSummaryError(null);
          }
        } else {
          // No data returned and no error - no summary exists
          if (mounted) {
            setSummary(null);
          }
        }
      } catch (err) {
        console.error('Error fetching existing summary (exception):', err);
        if (mounted) {
          setSummary(null);
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
            fetchExistingSummary(); // Load existing summary from database
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
          fetchExistingSummary(); // Load existing summary when auth state changes
        } else {
          setNotes([]);
          setSummary(null); // Clear summary when logged out
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchSummary = async () => {
    if (!session) {
      setSummaryError('Please log in to generate a summary.');
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);

    try {
      // Get the access token from the current session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession?.access_token) {
        throw new Error('No active session. Please log in again.');
      }

      const response = await fetch('/api/notes/summary', {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      });
      
      if (!response.ok) {
        const errorData: SummaryErrorResponse = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Handle rate limiting with specific message
        if (errorData.dailyLimitReached && errorData.generationsUsed && errorData.maxGenerations) {
          throw new Error(errorData.error || `Daily limit reached (${errorData.generationsUsed}/${errorData.maxGenerations}). Please try again tomorrow.`);
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: SummaryResponse = await response.json();
      setSummary(data.summary);
      setSummaryError(null);
      // Summary is now stored in database, so it will persist on refresh
    } catch (err) {
      console.error('Fetch summary error:', err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary. Please try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

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
          // Optionally trigger summary refresh in background
          // fetchSummary();
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

      {/* Notes Summary Card */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Notes Summary</CardTitle>
                <CardDescription>AI-generated summary of your saved notes</CardDescription>
              </div>
            </div>
            <Button
              onClick={fetchSummary}
              disabled={summaryLoading || notes.length === 0}
              variant="outline"
              className="hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 hover:text-white hover:border-transparent transition-all"
              title={notes.length === 0 ? 'Create at least one note to generate a summary' : ''}
            >
              {summaryLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : summary ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Summary
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {summaryLoading && !summary ? (
            <div className="py-8 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-purple-500" />
              <p className="text-sm text-gray-500">Generating summary...</p>
            </div>
          ) : summaryError ? (
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
              <AlertDescription className="text-red-700 dark:text-red-300">
                {summaryError}
              </AlertDescription>
            </Alert>
          ) : summary ? (
            <div className="space-y-2">
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                {summary}
              </p>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Brain className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              {notes.length === 0 ? (
                <>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    Create at least one note to generate a summary.
                  </p>
                  <p className="text-sm text-gray-500">
                    Once you have notes, you can generate an AI-powered summary.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    No summary yet. Click the button to generate.
                  </p>
                  <p className="text-sm text-gray-500">
                    The summary is created by analyzing all your notes using AI.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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

