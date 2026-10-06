"use client";

import { useState } from "react";

export default function PagosPage() {
  const [config, setConfig] = useState({
    provider: "transbank",
    commerce_code: "",
    api_key: "",
    secret_key: "",
    test_mode: true,
  });
  const [paymentMethods, setPaymentMethods] = useState({
    cash: true,
    debit_card: true,
    credit_card: true,
    transfer: true,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // In a real app, this would POST to an API
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const isConfigured = config.commerce_code && config.api_key;

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-3 md:space-y-6 animate-fade-in">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Terminal de Pagos</h1>

      {/* Status Card */}
      <div className={`p-4 rounded-lg border ${isConfigured ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConfigured ? "bg-green-500" : "bg-yellow-500"}`} />
          <span className={`font-medium ${isConfigured ? "text-green-700" : "text-yellow-700"}`}>
            {isConfigured ? "Terminal Conectado" : "No Configurado"}
          </span>
        </div>
      </div>

      {/* Provider Config */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-4">
        <h2 className="font-bold text-gray-800">Configuracion del Proveedor</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
          <select value={config.provider}
            onChange={(e) => setConfig({ ...config, provider: e.target.value })}
            className="w-full border rounded-lg px-3 py-2">
            <option value="transbank">Transbank</option>
            <option value="mercadopago">MercadoPago</option>
            <option value="flow">Flow</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Codigo de Comercio</label>
          <input type="text" value={config.commerce_code}
            onChange={(e) => setConfig({ ...config, commerce_code: e.target.value })}
            className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input type="password" value={config.api_key}
            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
            className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
          <input type="password" value={config.secret_key}
            onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
            className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="test_mode" checked={config.test_mode}
            onChange={(e) => setConfig({ ...config, test_mode: e.target.checked })}
            className="rounded" />
          <label htmlFor="test_mode" className="text-sm text-gray-700">Modo de prueba</label>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-4">
        <h2 className="font-bold text-gray-800">Metodos de Pago Habilitados</h2>
        <div className="space-y-3">
          {[
            { key: "cash", label: "Efectivo" },
            { key: "debit_card", label: "Debito" },
            { key: "credit_card", label: "Credito" },
            { key: "transfer", label: "Transferencia" },
          ].map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <input type="checkbox" id={m.key}
                checked={paymentMethods[m.key as keyof typeof paymentMethods]}
                onChange={(e) => setPaymentMethods({ ...paymentMethods, [m.key]: e.target.checked })}
                className="rounded" />
              <label htmlFor={m.key} className="text-sm text-gray-700">{m.label}</label>
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          Los precios de los servicios y productos pueden ser modificados al momento de cobrar en el POS.
        </p>
      </div>

      <button onClick={handleSave}
        className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
        {saved ? "Guardado!" : "Guardar Configuracion"}
      </button>
    </div>
  );
}
