/**
 * Componentes que renderizam o PDF e o QR Code de boleto buscando o blob
 * autenticado via API (os endpoints exigem JWT, então <img src> / <a href>
 * apontando direto pra URL da API não funcionam — o browser não manda
 * Authorization). Recebem nota_fiscal_id e cuidam de fetch + cleanup.
 */

import React, { useEffect, useState } from 'react';
import { creditosAPI } from '../services/api';

/**
 * Botão/link que abre o PDF do boleto em nova aba.
 *
 * Props:
 *  - notaId: number — id da nota fiscal
 *  - filename: string — nome sugerido para download (opcional)
 *  - children: conteúdo do botão
 *  - ...rest: passa pro <button>
 */
export function BoletoPdfLink({ notaId, filename, children, onError, ...rest }) {
  const [carregando, setCarregando] = useState(false);

  const abrir = async () => {
    if (!notaId || carregando) return;
    setCarregando(true);
    let url;
    try {
      url = await creditosAPI.fetchBoletoPdfBlobUrl(notaId);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        // popup bloqueado — força download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `boleto-${notaId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Revoga depois de alguns segundos pra dar tempo da nova aba carregar
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      if (onError) onError(err);
      else console.error('Erro ao abrir boleto:', err);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <button type="button" onClick={abrir} disabled={carregando || !notaId} {...rest}>
      {children}
    </button>
  );
}

/**
 * <img> do QR Code do boleto. Busca o blob autenticado e revoga ao desmontar.
 *
 * Props:
 *  - notaId: number — id da nota fiscal
 *  - alt, style, className, ...: passados pro <img>
 */
export function BoletoQrCode({ notaId, alt = 'QR Code do boleto', ...imgProps }) {
  const [src, setSrc] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!notaId) return undefined;
    let revogado = false;
    let urlCriada = null;
    setErro(false);
    creditosAPI.fetchBoletoQrCodeBlobUrl(notaId)
      .then((url) => {
        if (revogado) {
          URL.revokeObjectURL(url);
          return;
        }
        urlCriada = url;
        setSrc(url);
      })
      .catch(() => {
        if (!revogado) setErro(true);
      });
    return () => {
      revogado = true;
      if (urlCriada) URL.revokeObjectURL(urlCriada);
      setSrc(null);
    };
  }, [notaId]);

  if (erro) return <span style={{ color: '#fca5a5', fontSize: 12 }}>Erro ao carregar QR Code</span>;
  if (!src) return <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Carregando QR Code…</span>;
  return <img src={src} alt={alt} {...imgProps} />;
}
