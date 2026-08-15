'use client';

import { useFormStatus } from 'react-dom';
import { saveNoteAction } from '@/app/actions';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost mt-2" disabled={pending}>
      {pending ? 'Đang lưu…' : 'Lưu ghi chú'}
    </button>
  );
}

export function NoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  return (
    <form action={saveNoteAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <textarea
        name="note"
        defaultValue={note ?? ''}
        rows={3}
        className="input"
        placeholder="VD: khách hẹn giao sau 17h, gọi trước 10 phút"
      />
      <SaveButton />
    </form>
  );
}
