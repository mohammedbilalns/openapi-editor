'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Copy, Check, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/lib/openapi/store';
import { serializeToYaml } from '@/lib/openapi/serializer';

// Debounce hook for expensive operations
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function YamlPreview() {
  const { document, documentVersion } = useEditorStore();
  const [copied, setCopied] = useState(false);
  const [yaml, setYaml] = useState('# Loading...');
  const [isSerializing, setIsSerializing] = useState(false);
  const serializeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastVersionRef = useRef<number>(-1);
  
  // Debounce the version changes (300ms feels responsive but prevents thrashing)
  const debouncedVersion = useDebouncedValue(documentVersion, 300);

  // Serialize in a non-blocking way using setTimeout to yield to main thread
  useEffect(() => {
    // Skip if version hasn't changed
    if (lastVersionRef.current === debouncedVersion) {
      return;
    }
    
    setIsSerializing(true);
    
    // Clear any pending serialization
    if (serializeTimeoutRef.current) {
      clearTimeout(serializeTimeoutRef.current);
    }
    
    // Use setTimeout to allow UI to remain responsive
    serializeTimeoutRef.current = setTimeout(() => {
      try {
        const result = serializeToYaml(document);
        setYaml(result);
        lastVersionRef.current = debouncedVersion;
      } catch (error) {
        console.error('Failed to serialize document:', error);
        setYaml('# Error serializing document');
      } finally {
        setIsSerializing(false);
      }
    }, 0);
    
    return () => {
      if (serializeTimeoutRef.current) {
        clearTimeout(serializeTimeoutRef.current);
      }
    };
  }, [debouncedVersion, document]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.info.title.toLowerCase().replace(/\s+/g, '-')}-openapi.yaml`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col border-l-4 border-foreground bg-muted/30">
      <div className="flex items-center justify-between border-b-4 border-foreground bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold uppercase tracking-tight text-foreground">OpenAPI YAML</h3>
          {isSerializing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8 border-2 border-foreground bg-background hover:bg-muted hover:neo-shadow-sm" 
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-accent" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8 border-2 border-foreground bg-background hover:bg-muted hover:neo-shadow-sm" 
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 bg-card">
        <pre className="p-4 font-mono text-xs leading-relaxed">
          <code>
            <MemoizedYamlSyntaxHighlight content={yaml} />
          </code>
        </pre>
      </ScrollArea>
    </div>
  );
}

interface YamlSyntaxHighlightProps {
  content: string;
}

// Memoized to prevent re-renders when parent re-renders with same content
const MemoizedYamlSyntaxHighlight = memo(function YamlSyntaxHighlight({ content }: YamlSyntaxHighlightProps) {
  // For very large files, limit line rendering
  const lines = content.split('\n');
  const MAX_LINES = 5000;
  const truncated = lines.length > MAX_LINES;
  const displayLines = truncated ? lines.slice(0, MAX_LINES) : lines;

  return (
    <>
      {displayLines.map((line, index) => (
        <div key={index} className="whitespace-pre">
          <HighlightedLine line={line} />
        </div>
      ))}
      {truncated && (
        <div className="mt-4 border-2 border-dashed border-muted-foreground/50 p-4 text-center text-muted-foreground">
          <p className="font-bold uppercase">Large file truncated</p>
          <p className="font-mono text-xs mt-1">Showing first {MAX_LINES} of {lines.length} lines. Download to see full file.</p>
        </div>
      )}
    </>
  );
});

const HighlightedLine = memo(function HighlightedLine({ line }: { line: string }) {
  // Empty line
  if (!line.trim()) {
    return <span>&nbsp;</span>;
  }

  // Comment
  if (line.trimStart().startsWith('#')) {
    return <span className="text-muted-foreground">{line}</span>;
  }

  // Check for key-value pattern
  const keyMatch = line.match(/^(\s*)([^:]+)(:)(.*)$/);
  if (keyMatch) {
    const [, indent, key, colon, value] = keyMatch;
    const trimmedValue = value.trim();

    // Reference ($ref)
    if (key.trim() === '$ref') {
      return (
        <>
          <span>{indent}</span>
          <span className="text-cyan-600 dark:text-cyan-400">{key}</span>
          <span>{colon}</span>
          <span className="text-amber-600 dark:text-amber-400">{value}</span>
        </>
      );
    }

    // URL or string value
    if (trimmedValue.startsWith("'") || trimmedValue.startsWith('"')) {
      return (
        <>
          <span>{indent}</span>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span>{colon}</span>
          <span className="text-green-600 dark:text-green-400">{value}</span>
        </>
      );
    }

    // Boolean
    if (trimmedValue === 'true' || trimmedValue === 'false') {
      return (
        <>
          <span>{indent}</span>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span>{colon}</span>
          <span className="text-orange-600 dark:text-orange-400">{value}</span>
        </>
      );
    }

    // Number
    if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
      return (
        <>
          <span>{indent}</span>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span>{colon}</span>
          <span className="text-purple-600 dark:text-purple-400">{value}</span>
        </>
      );
    }

    // Regular key with value
    if (trimmedValue) {
      return (
        <>
          <span>{indent}</span>
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          <span>{colon}</span>
          <span className="text-foreground">{value}</span>
        </>
      );
    }

    // Key only (object/array start)
    return (
      <>
        <span>{indent}</span>
        <span className="text-blue-600 dark:text-blue-400">{key}</span>
        <span>{colon}</span>
      </>
    );
  }

  // Array item
  const arrayMatch = line.match(/^(\s*)(- )(.*)$/);
  if (arrayMatch) {
    const [, indent, dash, value] = arrayMatch;
    return (
      <>
        <span>{indent}</span>
        <span className="text-muted-foreground">{dash}</span>
        <span className="text-foreground">{value}</span>
      </>
    );
  }

  // Default
  return <span className="text-foreground">{line}</span>;
});
