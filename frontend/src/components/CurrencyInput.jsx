/**
 * Input de moeda BRL — máscara automática com separador de milhar.
 *
 * O usuário digita só dígitos (interpretados como centavos):
 *   "5"      → "0,05"
 *   "55"     → "0,55"
 *   "5555"   → "55,55"
 *   "55555"  → "555,55"
 *   "555500" → "5.555,00"
 *
 * O valor passado para o pai via onChange é uma string decimal pronta para
 * parseFloat (ex.: "5555.00"), preservando o contrato dos consumidores.
 */

import React from 'react';

const formatarBRL = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return '';
  const numero = parseFloat(raw);
  if (Number.isNaN(numero)) return '';
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const CurrencyInput = ({ value, onChange, disabled, placeholder = '0,00', style, className }) => {
  const handleChange = (e) => {
    const digitos = e.target.value.replace(/\D/g, '');
    if (!digitos) {
      onChange('');
      return;
    }
    const cents = parseInt(digitos, 10);
    onChange((cents / 100).toFixed(2));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatarBRL(value)}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      style={style}
      className={className}
    />
  );
};

export default CurrencyInput;
