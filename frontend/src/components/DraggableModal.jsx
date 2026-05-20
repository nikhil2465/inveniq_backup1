import { useState, useEffect, useRef } from 'react';

/**
 * useDraggable — makes any modal movable by dragging its header.
 *
 * Usage:
 *   const { ref, style } = useDraggable();
 *   return <div ref={ref} className="qb-modal" style={{ ...yourStyle, ...style }}>
 *     <div className="qb-modal-header" data-drag-handle> ... </div>
 *     ...
 *   </div>
 *
 * The hook attaches to the first child element that has class `qb-modal-header`,
 * `scan-modal` header, `pc-add-modal` header, or `[data-drag-handle]` attribute.
 * Dragging is cancelled when clicking buttons, inputs, or `[data-no-drag]` elements.
 */
export function useDraggable() {
  const [, tick] = useState(0);
  const posRef   = useRef({ x: 0, y: 0 });
  const dragRef  = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    // Find the drag handle — the modal header element
    const handle =
      modal.querySelector('[data-drag-handle]') ||
      modal.querySelector('.qb-modal-header') ||
      modal.querySelector('.pc-modal-header') ||
      modal.querySelector('[class$="-modal-header"]');

    if (!handle) return;

    handle.style.cursor = 'grab';

    const onDown = (e) => {
      if (e.button !== 0) return;
      // Don't start drag from interactive elements
      if (e.target.closest('button,input,textarea,select,a,[data-no-drag]')) return;
      handle.style.cursor = 'grabbing';
      dragRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        px: posRef.current.x,
        py: posRef.current.y,
      };
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;
      posRef.current = {
        x: dragRef.current.px + dx,
        y: dragRef.current.py + dy,
      };
      tick(n => n + 1);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      handle.style.cursor = 'grab';
    };

    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      handle.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []); // intentionally empty — effect runs once on mount to attach drag listeners

  const { x, y } = posRef.current;
  const style = (x || y)
    ? { transform: `translate(${x}px, ${y}px)`, transition: 'none' }
    : {};

  return { ref: modalRef, style };
}

export default useDraggable;
