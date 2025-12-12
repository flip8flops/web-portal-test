'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileText } from 'lucide-react';

interface CampaignFormProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CampaignForm({ value, onChange, disabled }: CampaignFormProps) {
  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Campaign Brief</CardTitle>
            <CardDescription>Enter your campaign planning notes</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <label htmlFor="campaign-notes" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Your notes
          </label>
          <textarea
            id="campaign-notes"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="also contain hint text"
            className="w-full min-h-[200px] px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enter your campaign planning notes, objectives, target audience, and any other relevant information.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

