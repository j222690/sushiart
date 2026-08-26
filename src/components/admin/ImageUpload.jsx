import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { storage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import ProductImage from '../ProductImage';

/**
 * Upload para o bucket `menu` do Supabase Storage.
 * A validação de tipo e tamanho fica em `storage.uploadImage` — aqui só
 * cuidamos do estado visual.
 */
export default function ImageUpload({ value, onChange, folder = 'produtos', label = 'Foto' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      onChange(await storage.uploadImage(file, folder));
      toast.success('Imagem enviada.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
      // Permite reenviar o mesmo arquivo depois de um erro.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-cream-muted">{label}</span>

      <div className="flex items-center gap-3">
        <ProductImage src={value} alt="Prévia" className="h-20 w-20 shrink-0" />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-ink-300 px-3.5 py-2 text-sm text-cream hover:border-vinho-500/50 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            {value ? 'Trocar imagem' : 'Enviar imagem'}
          </button>

          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 text-xs text-cream-faint hover:text-danger"
            >
              <Trash2 size={13} /> Remover
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        // image/* inclui o HEIC do iPhone, que a lista fixa deixava de fora — o
        // seletor do telefone nem mostrava as fotos da câmera.
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      <p className="mt-1.5 text-[11px] text-cream-faint">
        Pode mandar direto da câmera do celular, inclusive iPhone. A foto é reduzida
        aqui antes de subir.
      </p>
    </div>
  );
}
