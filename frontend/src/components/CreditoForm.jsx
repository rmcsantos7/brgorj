/**
 * Componente: CreditoForm
 * Sistema de Geração de Crédito - BR GORJETA
 * Fluxo: Lista de Recargas → Seleção de Colaboradores → Preview → Geração
 */

import React, { useState, useEffect } from 'react';
import './CreditoForm.css';

import ListaRecargas from './ListaRecargas';
import TabImportarExcel from './TabImportarExcel';
import TabSelecaoManual from './TabSelecaoManual';
import PreviewCredito from './PreviewCredito';

import { useFetchColaboradores } from '../hooks/useFetchColaboradores';
import { useCredito } from '../hooks/useCredito';
import { colaboradoresAPI } from '../services/api';

const CreditoForm = ({ clienteId, login = 'sistema' }) => {
  const [abaAtiva, setAbaAtiva] = useState('manual');
  const [etapa, setEtapa] = useState('lista'); // 'lista' | 'selecao' | 'preview'
  const [colaboradoresSelecionados, setColaboradoresSelecionados] = useState([]);
  const [taxaCliente, setTaxaCliente] = useState(0);
  const [tipoTaxa, setTipoTaxa] = useState('D');

  const colaboradoresHook = useFetchColaboradores(clienteId);
  const creditoHook = useCredito(clienteId, login);

  // Busca taxa do cliente uma vez
  useEffect(() => {
    if (clienteId) {
      colaboradoresAPI.obterTaxa(clienteId)
        .then(res => {
          setTaxaCliente(res.data.data.taxa || 0);
          setTipoTaxa(res.data.data.tipo === 'A' ? 'A' : 'D');
        })
        .catch(() => {
          setTaxaCliente(0);
          setTipoTaxa('D');
        });
    }
  }, [clienteId]);

  useEffect(() => {
    if (clienteId && etapa === 'selecao') {
      if (abaAtiva === 'manual') {
        colaboradoresHook.buscar();
      }
    }
  }, [clienteId, abaAtiva, etapa]);

  if (!clienteId) {
    return (
      <div className="credito-container">
        <div className="card">
          <div className="alert alert-erro">
            cliente_id não fornecido na URL
          </div>
        </div>
      </div>
    );
  }

  const irParaNovaRecarga = () => {
    setEtapa('selecao');
  };

  const irParaPreview = (colaboradores) => {
    if (colaboradores.length === 0) {
      alert('Selecione pelo menos 1 colaborador');
      return;
    }
    setColaboradoresSelecionados(colaboradores);
    setEtapa('preview');
  };

  const voltarParaSelecao = () => {
    setEtapa('selecao');
    setColaboradoresSelecionados([]);
  };

  const voltarParaLista = () => {
    setEtapa('lista');
    setColaboradoresSelecionados([]);
  };

  // Tela inicial: Lista de Recargas
  if (etapa === 'lista') {
    return (
      <div className="credito-container">
        <div className="card">
          <ListaRecargas
            clienteId={clienteId}
            onNovaRecarga={irParaNovaRecarga}
          />
        </div>
      </div>
    );
  }

  const renderizarAba = () => {
    if (etapa === 'preview') {
      return (
        <PreviewCredito
          clienteId={clienteId}
          colaboradores={colaboradoresSelecionados}
          creditoHook={creditoHook}
          taxa={taxaCliente}
          tipo={tipoTaxa}
          onVoltar={voltarParaSelecao}
          onSucesso={() => {
            voltarParaLista();
          }}
        />
      );
    }

    if (abaAtiva === 'manual') {
      return (
        <TabSelecaoManual
          clienteId={clienteId}
          colaboradoresHook={colaboradoresHook}
          onProximo={irParaPreview}
          onVoltar={voltarParaLista}
          onFechar={voltarParaLista}
        />
      );
    }

    if (abaAtiva === 'excel') {
      return (
        <TabImportarExcel
          clienteId={clienteId}
          colaboradoresHook={colaboradoresHook}
          onProximo={irParaPreview}
        />
      );
    }

    return null;
  };

  return (
    <div className="credito-container">
        {/* Card Principal */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                {etapa === 'preview' ? 'Confirmar Geração' : 'Geração de Recarga'}
              </h2>
              <p className="card-subtitle">
                {etapa === 'preview'
                  ? 'Revise os dados e confirme a recarga'
                  : 'Selecione colaboradores e configure os valores'}
              </p>
            </div>
            {/* Botão voltar para lista */}
            {etapa === 'selecao' && (
              <button className="btn-voltar" onClick={voltarParaLista}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Voltar
              </button>
            )}
          </div>

          <div className="divider"></div>

          {/* Abas */}
          {etapa === 'selecao' && (
            <div className="tabs">
              <button
                className={`tab ${abaAtiva === 'manual' ? 'ativa' : ''}`}
                onClick={() => setAbaAtiva('manual')}
              >
                Seleção Manual
              </button>
              <button
                className={`tab ${abaAtiva === 'excel' ? 'ativa' : ''}`}
                onClick={() => setAbaAtiva('excel')}
              >
                Importar Excel
              </button>
            </div>
          )}

          {/* Conteúdo */}
          <div className="tab-content">
            {renderizarAba()}
          </div>
        </div>

    </div>
  );
};

export default CreditoForm;
