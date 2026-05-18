import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { useImportMaterialsCsv, type ImportCsvResult } from '../../hooks/useMaterials';
import { useToast } from '../../hooks/use-toast';
import { Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function MaterialCsvImporter({ isOpen, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [result, setResult] = useState<ImportCsvResult | null>(null);
  const mut = useImportMaterialsCsv();
  const { toast } = useToast();

  function reset() {
    setFile(null);
    setPreview([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChange(f: File | null) {
    setFile(f);
    setResult(null);
    if (!f) {
      setPreview([]);
      return;
    }
    // Preview das 5 primeiras linhas
    const text = await f.text();
    const rows = text
      .split('\n')
      .slice(0, 6)
      .map((r) => r.split(','));
    setPreview(rows);
  }

  async function handleImport() {
    if (!file) return;
    try {
      const r = await mut.mutateAsync(file);
      setResult(r);
      if (r.errors.length === 0) {
        toast({
          title: 'Import concluído',
          description: `${r.created} criados, ${r.updated} atualizados.`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Import com avisos',
          description: `${r.created + r.updated} importados, ${r.errors.length} erros.`,
          variant: 'default',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Falha no import',
        description: err?.response?.data?.error?.message ?? 'Verifique o arquivo.',
        variant: 'destructive',
      });
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Importar materiais (CSV)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Formato: <code>sku,name,category,unit,spec</code> · max 500 linhas / 1MB
              </p>
            </div>
            <button onClick={handleClose} aria-label="Fechar">
              <X className="size-5" />
            </button>
          </header>

          {!result && (
            <>
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileChange(f);
                }}
              >
                <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm">
                  {file ? (
                    <span className="font-medium">{file.name}</span>
                  ) : (
                    'Clique ou arraste o arquivo .csv'
                  )}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </div>

              {preview.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Preview (primeiras 5 linhas):
                  </p>
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.map((row, i) => (
                          <tr
                            key={i}
                            className={i === 0 ? 'font-semibold bg-muted/50' : ''}
                          >
                            {row.map((cell, j) => (
                              <td key={j} className="px-2 py-1 border-r last:border-r-0">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="size-5" />
                  <div>
                    <p className="text-2xl font-semibold">{result.created}</p>
                    <p className="text-xs">criados</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-blue-700">
                  <CheckCircle2 className="size-5" />
                  <div>
                    <p className="text-2xl font-semibold">{result.updated}</p>
                    <p className="text-xs">atualizados</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="size-5" />
                  <div>
                    <p className="text-2xl font-semibold">{result.errors.length}</p>
                    <p className="text-xs">erros</p>
                  </div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 max-h-60 overflow-y-auto">
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    Linhas com erro:
                  </p>
                  <ul className="text-xs space-y-1">
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i} className="text-amber-800">
                        <strong>Linha {e.line}:</strong> {e.message}
                      </li>
                    ))}
                    {result.errors.length > 50 && (
                      <li className="text-amber-700 italic">
                        … e mais {result.errors.length - 50} erros
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <footer className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Fechar
            </Button>
            {!result && (
              <Button onClick={handleImport} disabled={!file || mut.isPending}>
                {mut.isPending ? 'Importando…' : 'Importar'}
              </Button>
            )}
            {result && (
              <Button onClick={reset} variant="outline">
                Importar outro
              </Button>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
