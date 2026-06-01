'use client';

import { useState, type ReactNode, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Camera, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseJsonResponse } from '@/lib/safe-json';

type UploadMode = 'file' | 'camera';

interface DocumentUploaderProps {
  trigger: (open: (mode?: UploadMode) => void) => ReactNode;
  defaultFileName?: string;
  onDocumentUploaded: (document: { name: string; url: string; uploadDate: string; expirationDate: string | null }) => Promise<void> | void;
  restrictedMode?: UploadMode;
}

export function DocumentUploader({ trigger, defaultFileName = '', onDocumentUploaded, restrictedMode }: DocumentUploaderProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>(restrictedMode || 'file');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadsConfigured, setUploadsConfigured] = useState<boolean | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');

  // Form state
  const [fileName, setFileName] = useState(defaultFileName);
  const [file, setFile] = useState<File | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileAccept = '.pdf,.csv,.txt,image/*';

  useEffect(() => {
    let active = true;

    const loadUploadStatus = async () => {
      try {
        const response = await fetch('/api/uploads/status', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (active) {
          setUploadsConfigured(Boolean(payload?.configured));
        }
      } catch {
        if (active) {
          setUploadsConfigured(false);
        }
      }
    };

    void loadUploadStatus();

    return () => {
      active = false;
    };
  }, []);

  const cleanupCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetForm = useCallback(() => {
    setFileName(defaultFileName);
    setFile(null);
    setCapturedImage(null);
    setHasCameraPermission(null);
    setCameraFacingMode('environment');
    setUploadMode(restrictedMode || 'file');
  }, [defaultFileName, restrictedMode]);

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      cleanupCamera();
      resetForm();
    } else {
      setFileName(defaultFileName);
    }
  };

  const openDialog = (mode: UploadMode = 'file') => {
    if (uploadsConfigured === false) {
      toast({
        variant: 'destructive',
        title: 'Uploads are not configured',
        description: 'Add Azure Blob Storage settings to enable file and photo uploads in production.',
      });
      return;
    }
    setUploadMode(restrictedMode || mode);
    setCameraFacingMode('environment');
    setIsOpen(true);
  };
  
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isOpen && uploadMode === 'camera' && !capturedImage) {
      const getCameraPermission = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera access is not supported in this browser.');
          }
          const constraints = {
            video: {
              facingMode: { ideal: cameraFacingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
            });
          }
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing camera:', error);
          setHasCameraPermission(false);
          toast({
            variant: 'destructive',
            title: 'Camera Access Denied',
            description: 'Please enable camera permissions in your browser settings.',
          });
        }
      };
      getCameraPermission();
    }
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacingMode, capturedImage, isOpen, toast, uploadMode]);

  const toggleCameraFacingMode = () => {
    cleanupCamera();
    setCapturedImage(null);
    setHasCameraPermission(null);
    setCameraFacingMode((current) => (current === 'environment' ? 'user' : 'environment'));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        setFile(selectedFile);
        if (!defaultFileName) {
            setFileName(selectedFile.name);
        }
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setCapturedImage(dataUrl);
            cleanupCamera();
        }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  const dataUrlToFile = (dataUrl: string, name: string) => {
    const [header, base64Payload] = dataUrl.split(',');
    if (!header || !base64Payload) {
      throw new Error('Captured photo data is invalid.');
    }

    const mimeMatch = header.match(/data:(.*?);base64/);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], name, { type: mimeType });
  };

  const uploadToServer = async (selectedFile: File, displayName: string) => {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('displayName', displayName);

    const response = await fetch('/api/uploads', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Upload failed' }));
      if (response.status === 503) {
        throw new Error(payload.error || 'Production file storage is not configured.');
      }
      throw new Error(payload.error || 'Upload failed');
    }

    const payload = await parseJsonResponse<{
      name: string;
      url: string;
      uploadDate: string;
      expirationDate: string | null;
      size?: number;
      contentType?: string | null;
    }>(response);

    if (!payload) {
      throw new Error('Upload succeeded but no response payload was returned.');
    }

    return payload;
  };

  const handleUpload = async () => {
    if (!fileName.trim()) {
        toast({
          variant: 'destructive',
          title: 'File Name Required',
          description: 'Please provide a name for the document.',
        });
        return;
    }

    try {
      setIsUploading(true);
      let selectedFile: File;

      if (uploadMode === 'file') {
        if (!file) {
          toast({ variant: 'destructive', title: 'No File Selected', description: 'Please select a file to upload.' });
          return;
        }
        selectedFile = file;
      } else {
        if (!capturedImage) {
          toast({ variant: 'destructive', title: 'No Photo Taken', description: 'Please take a photo to upload.' });
          return;
        }
        selectedFile = await dataUrlToFile(capturedImage, `${fileName}.jpg`);
      }

      const uploaded = await uploadToServer(selectedFile, fileName);
      await finishUpload(uploaded.url, uploaded.uploadDate);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Could not upload document.',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const finishUpload = async (url: string, uploadDate: string) => {
    await onDocumentUploaded({
        name: fileName,
        url,
        uploadDate,
        expirationDate: null,
    });

    toast({
      title: 'Document Uploaded',
      description: `"${fileName}" has been saved successfully.`,
    });
    
    setIsOpen(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger(openDialog)}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            {restrictedMode === 'camera' 
              ? 'Take a photo of the document using your camera.' 
              : restrictedMode === 'file' 
              ? 'Select a file from your device to upload.' 
              : 'Upload a file or take a photo of the document.'}
          </DialogDescription>
        </DialogHeader>
        {uploadsConfigured === false ? (
          <Alert variant="destructive">
            <AlertTitle>Uploads are not configured</AlertTitle>
            <AlertDescription>
              Add <code>AZURE_STORAGE_CONNECTION_STRING</code> and <code>AZURE_STORAGE_CONTAINER_NAME</code> in Azure App Service to enable uploads in production.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-6 py-4">
            <div className="space-y-2">
                <Label htmlFor="file-name">Document Name</Label>
                <Input
                    id="file-name"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="e.g., C of A, Insurance"
                />
            </div>
            <Tabs value={uploadMode} onValueChange={(value) => !restrictedMode && setUploadMode(value as UploadMode)} className='w-full'>
                {!restrictedMode && (
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="file">Upload File</TabsTrigger>
                        <TabsTrigger value="camera">Take Photo</TabsTrigger>
                    </TabsList>
                )}
                <TabsContent value="file">
                    <div className="space-y-2 pt-4">
                        <Label htmlFor="file-upload">File</Label>
                        <Input id="file-upload" type="file" accept={fileAccept} onChange={handleFileChange} />
                        {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
                    </div>
                </TabsContent>
                <TabsContent value="camera">
                     <div className="space-y-4 pt-4">
                        <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
                           {capturedImage ? (
                               <img src={capturedImage} alt="Captured document" className="h-full w-full object-contain" />
                           ) : (
                               <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
                           )}
                           {hasCameraPermission === false && (
                               <div className='absolute inset-0 flex items-center justify-center p-4'>
                                    <Alert variant="destructive">
                                        <AlertTitle>Camera Access Required</AlertTitle>
                                        <AlertDescription>
                                            Please allow camera access to use this feature.
                                        </AlertDescription>
                                    </Alert>
                               </div>
                           )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                        <div className='flex gap-2'>
                            {capturedImage ? (
                                <Button type="button" variant="outline" onClick={handleRetake}>Retake Photo</Button>
                            ) : (
                                <>
                                  <Button type="button" variant="outline" onClick={toggleCameraFacingMode} disabled={hasCameraPermission === false}>
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Swap Camera
                                  </Button>
                                  <Button type="button" onClick={handleCapture} disabled={hasCameraPermission !== true}>
                                      <Camera className='mr-2' />
                                      Capture
                                  </Button>
                                </>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Upload'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
