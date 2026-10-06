import { useEffect, useState } from 'react';
import { imageProblem } from '../api/images';
import ItemImage from './ItemImage';

export type ImageChange = { file: File | null; remove: boolean };
export const noImageChange: ImageChange = { file: null, remove: false };

type ImageFieldProps = {
  /** Accessible name of the file input, e.g. "Prize image". */
  label: string;
  itemName: string;
  currentUrl: string | null;
  value: ImageChange;
  onChange: (change: ImageChange) => void;
};

/** Choose, preview, replace or remove one image; the form applies the change when it saves (AC-PRZ-10, AC-CMP-12). */
export default function ImageField({ label, itemName, currentUrl, value, onChange }: ImageFieldProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!value.file) { setPreview(null); return; }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = imageProblem(file);
    setError(problem);
    if (!problem) onChange({ file, remove: false });
  }

  const showsCurrent = Boolean(currentUrl) && !value.remove;
  const hasImage = Boolean(preview) || showsCurrent;
  return (
    <div className="prize-image-field">
      <span className="prize-image-label">Image <span className="optional-label">OPTIONAL · JPG, PNG OR WEBP, UP TO 2 MB</span></span>
      <div className="prize-image-row">
        {preview
          ? <img alt={`New ${label.toLowerCase()} preview`} className="prize-image large" src={preview} />
          : <ItemImage name={itemName || 'Item'} size="large" url={showsCurrent ? currentUrl : null} />}
        <div className="prize-image-actions">
          <label className="quiet-button prize-image-upload">{hasImage ? 'Replace image' : 'Upload image'}
            <input accept="image/jpeg,image/png,image/webp" aria-label={label} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} type="file" />
          </label>
          {hasImage && <button className="quiet-button" onClick={() => { setError(''); onChange({ file: null, remove: Boolean(currentUrl) }); }} type="button">Remove image</button>}
          {value.remove && <small className="field-help">The image will be removed when you save.</small>}
        </div>
      </div>
      {error && <p className="payment-error" role="alert">{error}</p>}
    </div>
  );
}
