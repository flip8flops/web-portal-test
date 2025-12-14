'use client';

import { useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image, Upload, X } from 'lucide-react';

interface ImageUploadProps {
  onImageSelect: (file: File | null) => void;
  disabled?: boolean;
}

export function ImageUpload({ onImageSelect, disabled }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    // Validate file type (only PNG and JPG)
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      alert('Format file tidak didukung. Silakan upload gambar PNG atau JPG saja.');
      return;
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      alert(`Ukuran file terlalu besar (${fileSizeMB} MB). Maksimal 2 MB. Silakan kompres atau pilih gambar lain.`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    onImageSelect(file);
  }, [onImageSelect]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    setPreview(null);
    onImageSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onImageSelect]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Card className={`border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 transition-opacity duration-300 ${disabled ? 'opacity-60' : ''}`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            <Image className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Additional image to send</CardTitle>
            <CardDescription>Upload an image to include with your campaign</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {preview ? (
          <div className="relative">
            <div className="relative w-full h-48 rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-700">
              <img
                src={preview}
                alt="Campaign preview"
                className="w-full h-full object-contain"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="absolute top-2 right-2"
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
        ) : (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleClick}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-all duration-200
              ${dragActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleChange}
              disabled={disabled}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
                <Upload className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  PNG atau JPG, maksimal 2MB
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

