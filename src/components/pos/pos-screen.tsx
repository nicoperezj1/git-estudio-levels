"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useTenant } from "@/lib/tenant-context";
import {
  Sparkles, Package, Search, Plus, Minus, Trash2, ShoppingBag, Tag, Lock, Check, Star,
  Banknote, CreditCard, ArrowLeftRight, ArrowRight, ArrowUp, ArrowDown,
} from "lucide-react";
import { SaleCelebration } from "@/components/pos/sale-celebration";
import { CashReductionPrompt } from "@/components/pos/cash-reduction-prompt";
import { StandbyHeader } from "@/components/standby/standby-header";
import { CajaLockGate } from "@/components/caja/caja-lock";
import { ReceptionistGreeting } from "@/components/ui/receptionist-greeting";
import { useLedgerEnabled } from "@/components/finance/professional-ledger-view";
import SourceSelect from "@/components/clients/source-select";

interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  category?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
}

// Monograma con las iniciales del item: le da caracter a cada tarjeta en vez de un icono generico.
function Monogram({ name, tone, size = 40 }: { name: string; tone: "teal" | "amber"; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-tight ${
        tone === "teal"
          ? "bg-gradient-to-br from-brand-blue/25 to-brand-accent/10 text-brand-blue ring-1 ring-brand-blue/20"
          : "bg-gradient-to-br from-orange-400/25 to-amber-300/10 text-orange-500 ring-1 ring-orange-400/25"
      }`}
    >
      {initials || "•"}
    </div>
  );
}

interface Client {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
}

interface Barber {
  id: string;
  name: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: "service" | "product";
}

// Modo Standby (Fase 5): el MISMO Punto de Venta, pero con el profesional ya identificado por su PIN y con el control
// del efectivo en caja (dinero en caja, reportar problema, reduccion de efectivo). El cobro es igual (cliente, cupon,
// puntos, propina, pago dividido, tarjeta en la maquina, caja, ingresos, metricas…).
export interface StandbyCtx { barber: { id: string; name: string }; onExit: () => void; onReview?: () => void }

// En el Punto de Venta del computador general (sin Standby) la pantalla se puede apagar con "Apagar caja" y se enciende con
// el PIN de recepcion o del administrador (el mismo bloqueo de la pantalla Caja). El Standby tiene su propio PIN.
export default function PosScreen({ standby }: { standby?: StandbyCtx }) {
  if (standby) return <PosScreenInner standby={standby} />;
  return <CajaLockGate>{(lock) => <PosScreenInner onLock={lock} />}</CajaLockGate>;
}

function PosScreenInner({ standby, onLock }: { standby?: StandbyCtx; onLock?: () => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [activeTab, setActiveTab] = useState<"services" | "products">("services");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "price_asc" | "price_desc">("default");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedBarber, setSelectedBarber] = useState(standby?.barber.id || "");
  const [selectedClient, setSelectedClient] = useState("");
  // Cita que viene del boton "Cobrar" del calendario: al cobrar queda completada.
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  // Alta rapida de cliente desde el POS (Nico, 29-sep): si el nombre escrito no existe.
  const [addingClient, setAddingClient] = useState(false);
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientSource, setNewClientSource] = useState("walk_in");
  const [savingClient, setSavingClient] = useState(false);
  const [clientPoints, setClientPoints] = useState(0);
  const [redeemedPoints, setRedeemedPoints] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<Array<{ method: string; amount: string }>>([
    { method: "debit_card", amount: "" },
    { method: "cash", amount: "" },
  ]);
  const [processing, setProcessing] = useState(false);
  // "unconfirmed" = we could not get a final answer from the terminal (timeout, rate
  // limit, network). It is NOT a rejection: the machine may well have charged the
  // client. The cashier is asked to look at the terminal and confirm, so a paid sale is
  // never silently discarded (that exact bug lost a real charge once).
  const [mpPaymentStatus, setMpPaymentStatus] = useState<"idle" | "waiting" | "approved" | "rejected" | "unconfirmed">("idle");
  const [confirmUnclearCharge, setConfirmUnclearCharge] = useState<((approved: boolean) => void) | null>(null);
  // Lets the cashier force an immediate re-check while the "Esperando pago" modal is
  // open, instead of waiting out the 2-minute poll — for the reported case where the
  // machine already charged but the signal hadn't reached re-booking yet.
  const [recheckCharge, setRecheckCharge] = useState<(() => void) | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [mpPaymentIntentId, setMpPaymentIntentId] = useState("");
  const [splitChargeProgress, setSplitChargeProgress] = useState("");
  const [currentChargeAmount, setCurrentChargeAmount] = useState(0);
  const [cancelCurrentCharge, setCancelCurrentCharge] = useState<(() => void) | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // Sube con cada venta registrada: dispara el aviso de reduccion de efectivo si la caja pasa el tope.
  const [saleCounter, setSaleCounter] = useState(0);
  const [successAmount, setSuccessAmount] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [manualDiscountAmount, setManualDiscountAmount] = useState("");
  const [manualDiscountType, setManualDiscountType] = useState<"fixed" | "percent">("fixed");
  // Which terminal provider handles card charges for this tenant. Defaults to
  // "mercadopago" (existing behavior for every tenant that hasn't configured TUU),
  // set from tenant_settings.card_payment_provider — see Configuracion -> TUU.
  const [cardProvider, setCardProvider] = useState<"mercadopago" | "tuu">("mercadopago");
  const { showToast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();

  // Get tenant ID (from context or localStorage override for super_admin)
  const getActiveTenantId = () => {
    if (tenant?.id) return tenant.id;
    try {
      const stored = localStorage.getItem("tenant_override");
      if (stored) return JSON.parse(stored).tenantId;
    } catch {}
    return "";
  };

  useEffect(() => {
    if (tenantLoading) return;
    const t = getActiveTenantId();
    const params = t ? `?tenantId=${t}` : "";
    Promise.all([
      fetch(`/api/services${params}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/products${params}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/clients${params ? params + "&" : "?"}limit=5000`).then((r) => r.json()).catch(() => ({ clients: [] })),
      fetch(`/api/barberos${params}`).then((r) => r.json()).catch(() => []),
      t ? fetch(`/api/settings/tuu?tenantId=${t}`).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
    ]).then(async ([servicesData, productsData, clientsData, barbersData, tuuSettings]) => {
      let svcList: Service[] = Array.isArray(servicesData) ? servicesData : [];
      if (standby) {
        // Solo SUS servicios (los que tiene asignados) y con su precio propio si lo tiene.
        try {
          const mine = await fetch(`/api/public/barber-services?barberId=${standby.barber.id}`).then((r) => r.json());
          if (Array.isArray(mine) && mine.length > 0) {
            const byId = new Map<string, any>(mine.map((m: any) => [m.id, m]));
            svcList = svcList.filter((x) => byId.has(x.id)).map((x) => ({ ...x, price: Number(byId.get(x.id).price), duration: Number(byId.get(x.id).duration) || x.duration }));
          }
        } catch {}
      }
      setServices(svcList);
      // Los insumos (uso del negocio, migracion 092) no se venden: no aparecen en el POS. Sin tipo = Venta, como siempre.
      setProducts(Array.isArray(productsData) ? productsData.filter((p: any) => (p.product_type || "sale") !== "supply") : []);
      setClients(Array.isArray(clientsData?.clients) ? clientsData.clients : Array.isArray(clientsData) ? clientsData : []);
      setBarbers(Array.isArray(barbersData) ? barbersData : []);
      if (tuuSettings?.card_payment_provider === "tuu") setCardProvider("tuu");

      // Pre-load from the calendar's "Cobrar" button (?clientId=&barberId=&serviceIds=).
      // Lets the cashier charge an existing appointment without hunting for the client.
      try {
        const sp = new URLSearchParams(window.location.search);
        const preBarber = sp.get("barberId");
        const preClient = sp.get("clientId");
        const preServices = sp.get("serviceIds");
        const preAppt = sp.get("appointmentId");
        if (preAppt) setAppointmentId(preAppt);
        if (preBarber) setSelectedBarber(preBarber);
        if (preClient) {
          setSelectedClient(preClient);
          // Also load the client's name + points and show them. Without this, only the
          // id was set (invisible), the cashier saw an empty client field, searched by
          // hand and could pick the wrong person with a similar name — which is how a
          // receipt/points got charged to the wrong client. Now the pre-loaded client is
          // shown by name, no manual search needed.
          fetch(`/api/clients/${preClient}`)
            .then((r) => r.json())
            .then((d) => {
              const c = d?.client;
              if (c?.name) setClientSearch(c.name);
              setClientPoints(c?.loyalty_points || 0);
            })
            .catch(() => {});
        }
        if (preServices) {
          const ids = preServices.split(",").filter(Boolean);
          const preCart = ids
            .map((id) => svcList.find((s) => s.id === id))
            .filter(Boolean)
            .map((s) => ({ id: s!.id, name: s!.name, price: Number(s!.price), quantity: 1, type: "service" as const }));
          if (preCart.length) setCart(preCart);
        }
      } catch {}
    });
  }, [tenant?.id, tenantLoading]);

  // Get unique categories from services
  const serviceCategories = Array.from(new Set(services.map((s) => s.category).filter(Boolean))) as string[];

  const filteredItems = (() => {
    let items: Array<Service | Product> = activeTab === "services"
      ? services.filter((s) => {
          const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
          const matchesCategory = categoryFilter === "all" || s.category === categoryFilter;
          return matchesSearch && matchesCategory;
        })
      : products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search)));

    if (sortBy === "price_asc") items = [...items].sort((a, b) => a.price - b.price);
    if (sortBy === "price_desc") items = [...items].sort((a, b) => b.price - a.price);
    return items;
  })();

  const addToCart = (item: Service | Product, type: "service" | "product") => {
    const existing = cart.find((c) => c.id === item.id && c.type === type);
    if (existing) {
      setCart(cart.map((c) => (c.id === item.id && c.type === type ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      setCart([...cart, { id: item.id, name: item.name, price: Number(item.price), quantity: 1, type }]);
    }
  };

  const updateQuantity = (id: string, type: string, delta: number) => {
    setCart(
      cart
        .map((c) => (c.id === id && c.type === type ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const updatePrice = (id: string, type: string, price: number) => {
    setCart(cart.map((c) => (c.id === id && c.type === type ? { ...c, price } : c)));
  };

  const removeFromCart = (id: string, type: string) => {
    setCart(cart.filter((c) => !(c.id === id && c.type === type)));
  };

  const subtotal = cart.reduce((sum, c) => sum + Number(c.price) * c.quantity, 0);
  // Tip is NOT part of the amount charged from the POS anymore. The card terminal
  // itself asks the client for a tip when they pay with debit/credit, and that tip is
  // only recorded here afterwards (informational) — never bundled into "total" or sent
  // to MercadoPago as part of the charge. See tipAmount / tip modal below.
  const total = subtotal - discount;
  const [showTipModal, setShowTipModal] = useState(false);
  // Con el libro de movimientos encendido (Configuracion) la propina se pregunta en TODA venta (tambien efectivo) y se
  // sugiere el 10%; va al profesional que atendio. Apagado: solo se pregunta tras un pago con tarjeta, como siempre.
  const ledgerOn = !!useLedgerEnabled();
  const [tipKind, setTipKind] = useState<"card" | "cash">("card");
  const [tipInput, setTipInput] = useState("");
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);

  const applyCoupon = async () => {
    setCouponError("");
    if (!couponCode) return;
    try {
      const res = await fetch(`/api/cupones/validate?code=${couponCode}&amount=${subtotal}`);
      const data = await res.json();
      if (data.valid) {
        setDiscount(data.discount);
        showToast("Cupon aplicado", "success");
      } else {
        setCouponError(data.message || "Cupon invalido");
        setDiscount(0);
      }
    } catch {
      setCouponError("Error al validar cupon");
    }
  };

  const applyManualDiscount = async () => {
    setPinError("");
    const res = await fetch("/api/pos/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput }),
    });
    const data = await res.json();
    if (!data.valid) {
      setPinError(data.error || "PIN incorrecto");
      return;
    }
    // Apply discount
    const amount = parseInt(manualDiscountAmount) || 0;
    if (amount <= 0) {
      setPinError("Ingresa un monto valido");
      return;
    }
    const discountValue = manualDiscountType === "percent"
      ? Math.round(subtotal * (amount / 100))
      : amount;
    setDiscount(Math.min(discountValue, subtotal));
    setCouponCode("");
    setShowPinModal(false);
    setPinInput("");
    setManualDiscountAmount("");
    showToast(`Descuento autorizado por ${data.adminName}`, "success");
  };

  // Charge a single amount on the card terminal and wait for the result.
  // Used for a normal card payment AND for each card portion of a split payment
  // (a physical terminal can only charge one amount at a time).
  // Dispatches to MercadoPago or TUU depending on cardProvider (tenant setting) —
  // the rest of the app (handleCheckout, the payment modal) doesn't need to know
  // which provider is active, it just awaits true/false like before.
  const chargeCardAmount = (amount: number, description: string, cardMethod: "debit_card" | "credit_card" = "debit_card"): Promise<boolean> => {
    setMpPaymentStatus("waiting");
    setCurrentChargeAmount(amount);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        setCancelCurrentCharge(null);
        setRecheckCharge(null);
        resolve(ok);
      };
      (async () => {
        try {
          // Determine cart type for multi-terminal routing
          const hasServices = cart.some((c) => c.type === "service");
          const hasProducts = cart.some((c) => c.type === "product");
          const cartType = hasServices && hasProducts ? "mixed" : hasServices ? "services" : "products";

          const createUrl = cardProvider === "tuu" ? "/api/tuu" : "/api/mercadopago";
          const statusUrl = cardProvider === "tuu" ? "/api/tuu/status" : "/api/mercadopago/status";
          const cancelUrl = cardProvider === "tuu" ? "/api/tuu/cancel" : "/api/mercadopago/cancel";

          const chargeRes = await fetch(createUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              barberId: selectedBarber,
              amount,
              description: description || cart.map((c) => c.name).join(", ").slice(0, 50) || "Venta re-booking",
              externalReference: `pos-${Date.now()}`,
              cartType,
              cardMethod, // only used by TUU (paymentMethod: credito/debito); ignored by MP
            }),
          });
          const chargeData = await chargeRes.json();

          if (!chargeRes.ok || !chargeData.paymentIntentId) {
            showToast(chargeData.error || "Error al iniciar el cobro", "error");
            setMpPaymentStatus("rejected");
            setTimeout(() => setMpPaymentStatus("idle"), 3000);
            finish(false);
            return;
          }

          setMpPaymentIntentId(chargeData.paymentIntentId);

          // TUU documents a request quota (~1 per minute per terminal, error 429), so
          // polling it as fast as MercadoPago just produces rate-limit errors.
          const pollEveryMs = cardProvider === "tuu" ? 6000 : 3000;

          const checkStatus = async (): Promise<string> => {
            try {
              const statusRes = await fetch(`${statusUrl}?id=${chargeData.paymentIntentId}&barberId=${selectedBarber}`);
              const statusData = await statusRes.json();
              return statusData?.status || "unknown";
            } catch {
              return "unknown";
            }
          };

          // Shared resolver so both the automatic poll and the manual "Ya pagó /
          // Reconsultar" button apply the same result handling.
          const applyStatus = (status: string): boolean => {
            if (status === "approved") {
              clearInterval(pollInterval);
              clearTimeout(timeoutHandle);
              setMpPaymentStatus("approved");
              setTimeout(() => setMpPaymentStatus("idle"), 1200);
              finish(true);
              return true;
            }
            if (status === "cancelled" || status === "rejected") {
              clearInterval(pollInterval);
              clearTimeout(timeoutHandle);
              setMpPaymentStatus("rejected");
              setTimeout(() => setMpPaymentStatus("idle"), 3000);
              finish(false);
              return true;
            }
            return false; // "pending" | "rate_limited" | "unknown" => keep waiting
          };

          const pollInterval = setInterval(async () => {
            applyStatus(await checkStatus());
          }, pollEveryMs);

          // Manual re-check button on the waiting modal.
          setRecheckCharge(() => async () => {
            setRechecking(true);
            const status = await checkStatus();
            setRechecking(false);
            const resolved = applyStatus(status);
            if (!resolved) {
              showToast("La maquina aun no confirma el pago. Espera unos segundos y reintenta.", "info");
            }
          });

          // Time's up. This does NOT mean the payment failed — we simply have no
          // answer. Do one last check, and if it's still unclear, ask the cashier to
          // read the terminal instead of throwing away a possibly-charged sale.
          const timeoutHandle = setTimeout(async () => {
            clearInterval(pollInterval);

            const finalStatus = await checkStatus();
            if (finalStatus === "approved") {
              setMpPaymentStatus("approved");
              setTimeout(() => setMpPaymentStatus("idle"), 1200);
              finish(true);
              return;
            }
            if (finalStatus === "cancelled" || finalStatus === "rejected") {
              setMpPaymentStatus("rejected");
              setTimeout(() => setMpPaymentStatus("idle"), 3000);
              finish(false);
              return;
            }

            setMpPaymentStatus("unconfirmed");
            setConfirmUnclearCharge(() => (approved: boolean) => {
              setConfirmUnclearCharge(null);
              setMpPaymentStatus(approved ? "approved" : "idle");
              if (approved) setTimeout(() => setMpPaymentStatus("idle"), 1200);
              finish(approved);
            });
          }, 120000);

          // Let the user cancel this specific charge (used by the modal's Cancel button).
          // NOTE: for TUU this only stops OUR polling — TUU's public API has no
          // documented way to cancel a request already sent to the terminal, so the
          // physical POS may keep waiting for a card until cancelled on the machine.
          setCancelCurrentCharge(() => () => {
            clearInterval(pollInterval);
            clearTimeout(timeoutHandle);
            fetch(cancelUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cardProvider === "tuu" ? { idempotencyKey: chargeData.paymentIntentId } : { orderId: chargeData.paymentIntentId }),
            });
            if (cardProvider === "tuu") showToast("Si la maquina TUU sigue esperando la tarjeta, cancelalo tambien ahi", "info");
            setMpPaymentStatus("idle");
            setMpPaymentIntentId("");
            finish(false);
          });
        } catch (err) {
          setMpPaymentStatus("rejected");
          setTimeout(() => setMpPaymentStatus("idle"), 3000);
          finish(false);
        }
      })();
    });
  };

  const handleCheckout = async () => {
    // Validate based on mode
    if (!selectedBarber || cart.length === 0) return;

    if (splitMode) {
      const splitTotal = splitPayments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
      if (splitTotal !== total) return;

      // Charge every card portion (debit or credit) on the MP terminal, one at a time.
      // This was the missing piece: a split payment never touched the terminal at all,
      // so a debit portion in a split never activated the machine.
      const cardSplits = splitPayments
        .map((p, idx) => ({ ...p, idx }))
        .filter((p) => (p.method === "debit_card" || p.method === "credit_card") && parseInt(p.amount) > 0);

      for (let i = 0; i < cardSplits.length; i++) {
        const sp = cardSplits[i];
        const amount = parseInt(sp.amount);
        const methodLabel = sp.method === "debit_card" ? "Debito" : "Credito";
        setSplitChargeProgress(`Cobrando ${methodLabel} ${formatCurrency(amount)} (${i + 1} de ${cardSplits.length})`);

        const approved = await chargeCardAmount(amount, `${methodLabel} - pago dividido`, sp.method as "debit_card" | "credit_card");
        if (!approved) {
          setSplitChargeProgress("");
          return; // Abort: don't record the sale, cashier can retry the failed portion
        }
      }
      setSplitChargeProgress("");
      await processCheckout();
      return;
    }

    if (!paymentMethod) return;

    const isCardPayment = paymentMethod === "debit_card" || paymentMethod === "credit_card";

    if (isCardPayment) {
      const approved = await chargeCardAmount(total, cart.map((c) => c.name).join(", ").slice(0, 50), paymentMethod as "debit_card" | "credit_card");
      if (approved) await processCheckout();
      return;
    }

    // Non-card payments: process immediately
    await processCheckout();
  };

  const processCheckout = async () => {
    setProcessing(true);
    try {
      const payments = splitMode
        ? splitPayments.filter((p) => parseInt(p.amount) > 0).map((p) => ({ method: p.method, amount: parseInt(p.amount) }))
        : undefined;

      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId: selectedBarber,
          clientId: selectedClient || null,
          items: cart,
          paymentMethod: splitMode ? "mixed" : paymentMethod,
          payments,
          couponCode: couponCode || null,
          discount,
          subtotal,
          total,
          redeemedPoints: redeemedPoints || 0,
          appointmentId: appointmentId || null,
          origin: standby ? "standby" : "pos",
          issuedBy: standby ? standby.barber.id : undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setAppointmentId(null);
        // Was any part of this sale paid by card? The terminal asks for a tip itself
        // when that happens, so we ask the cashier to record it afterwards — we never
        // charge the tip ourselves, only log what the client added on the machine.
        const hadCardPayment = splitMode
          ? splitPayments.some((p) => (p.method === "debit_card" || p.method === "credit_card") && parseInt(p.amount) > 0)
          : (paymentMethod === "debit_card" || paymentMethod === "credit_card");

        setCart([]);
        setDiscount(0);
        setCouponCode("");
        setPaymentMethod("");
        setSplitMode(false);
        setSplitPayments([{ method: "debit_card", amount: "" }, { method: "cash", amount: "" }]);
        setSelectedClient("");
        setClientPoints(0);
        setRedeemedPoints(0);
        setMpPaymentStatus("idle");
        setMpPaymentIntentId("");
        setSplitChargeProgress("");
        setSuccessAmount(total);

        if ((hadCardPayment || ledgerOn) && result.transactionId) {
          setLastTransactionId(result.transactionId);
          setTipKind(hadCardPayment ? "card" : "cash");
          setTipInput("");
          setShowTipModal(true);
        } else {
          setShowSuccessModal(true); setSaleCounter((n) => n + 1);
          setTimeout(() => setShowSuccessModal(false), 4000);
        }
      }
    } catch (err) {
      console.error("Error en checkout:", err);
    } finally {
      setProcessing(false);
    }
  };

  const recordTip = async (amount: number) => {
    if (lastTransactionId && amount > 0) {
      try {
        await fetch(`/api/pos/checkout/tip`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: lastTransactionId, tipAmount: amount }),
        });
      } catch (e) {
        console.error("Error registrando propina:", e);
      }
    }
    setShowTipModal(false);
    setLastTransactionId(null);
    setShowSuccessModal(true); setSaleCounter((n) => n + 1);
    setTimeout(() => setShowSuccessModal(false), 4000);
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-4rem)]">
      {/* Left: Items */}
      <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
        {standby ? (
          <StandbyHeader barber={standby.barber} products={products} saleCounter={saleCounter} onExit={standby.onExit} onReview={standby.onReview} />
        ) : (
          <div className="mb-2 flex items-start justify-between gap-3">
            <ReceptionistGreeting className="mb-0" />
            {onLock && (
              <button type="button" onClick={onLock} className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-gray hover:bg-gray-50 hover:text-brand-dark">
                🔒 Apagar caja
              </button>
            )}
          </div>
        )}
        {/* Barra superior: pestañas segmentadas + buscador + orden */}
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-2xl border border-gray-100 bg-brand-light p-1">
              {([
                { key: "services", label: "Servicios", count: services.length, Icon: Sparkles },
                { key: "products", label: "Productos", count: products.length, Icon: Package },
              ] as const).map(({ key, label, count, Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                      active ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/25" : "text-brand-gray hover:text-brand-dark"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    {label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${active ? "bg-white/20" : "bg-black/5 dark:bg-white/10"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-gray" strokeWidth={1.75} />
              <input
                type="text"
                placeholder="Buscar o escanear código de barras..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && search.trim()) {
                    // Barcode scanner sends Enter after scan
                    const found = products.find((p) => p.barcode === search.trim());
                    if (found) {
                      addToCart(found, "product");
                      setSearch("");
                      setActiveTab("products");
                    }
                  }
                }}
                className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {([
                { key: "price_asc", Icon: ArrowUp, label: "Precio menor a mayor" },
                { key: "price_desc", Icon: ArrowDown, label: "Precio mayor a menor" },
              ] as const).map(({ key, Icon, label }) => (
                <button
                  key={key}
                  title={label}
                  onClick={() => setSortBy(sortBy === key ? "default" : key)}
                  className={`flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    sortBy === key
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/40 hover:text-brand-dark"
                  }`}
                >
                  Precio <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>

          {/* Filtro por categoria (solo servicios) */}
          {activeTab === "services" && serviceCategories.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {["all", ...serviceCategories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    categoryFilter === cat
                      ? "border-transparent bg-brand-blue text-white shadow-md shadow-brand-blue/25"
                      : "border-gray-200 bg-white text-brand-gray hover:border-brand-blue/50 hover:text-brand-dark"
                  }`}
                >
                  {cat === "all" ? "Todos" : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product/Service grid. For services with categories and no active filter,
            render them grouped under a category heading so the cashier can visually
            separate e.g. Nicolas's services from the rest and find the right price fast
            (Nico's request). Otherwise (products, or a specific category filter, or a
            search) fall back to a single flat grid. */}
        {(() => {
          const renderCard = (item: Service | Product) => {
            const type = activeTab === "services" ? "service" : "product";
            const isService = type === "service";
            const inCart = cart.find((c) => c.id === item.id && c.type === type);
            const stock = isService ? null : Number((item as Product).stock);
            const lowStock = stock !== null && stock <= 3;
            return (
              <button
                key={item.id}
                onClick={() => addToCart(item, type)}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97] ${
                  inCart
                    ? "border-brand-blue bg-brand-blue/[0.06] shadow-lg shadow-brand-blue/10 ring-1 ring-brand-blue/40"
                    : "border-gray-100 bg-white hover:border-brand-blue/40 hover:shadow-lg hover:shadow-black/5"
                }`}
              >
                {/* brillo sutil al pasar el cursor */}
                <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-blue/15 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between">
                  <Monogram name={item.name} tone={isService ? "teal" : "amber"} />
                  {inCart ? (
                    <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-brand-blue px-1.5 text-xs font-bold text-white shadow-md">
                      ×{inCart.quantity}
                    </span>
                  ) : (
                    <span className="flex h-7 w-7 scale-75 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
                      <Plus className="h-4 w-4" strokeWidth={2.25} />
                    </span>
                  )}
                </div>
                <p className="relative mt-3 line-clamp-2 min-h-[2.5em] text-[15px] font-semibold leading-tight text-brand-dark">{item.name}</p>
                <div className="relative mt-2 flex items-end justify-between gap-2">
                  <p className="text-xl font-extrabold tracking-tight text-brand-blue tabular-nums">{formatCurrency(Number(item.price))}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      lowStock ? "bg-red-500/15 text-red-500" : "bg-black/5 text-brand-gray dark:bg-white/10"
                    }`}
                  >
                    {isService ? `${(item as Service).duration} min` : `Stock ${stock}`}
                  </span>
                </div>
              </button>
            );
          };

          const grouped =
            activeTab === "services" &&
            categoryFilter === "all" &&
            !search.trim() &&
            serviceCategories.length > 0;

          if (!grouped) {
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredItems.map(renderCard)}
              </div>
            );
          }

          // Build ordered groups: each named category, then "Sin categoria" at the end.
          const services = filteredItems as Service[];
          const groups: Array<{ label: string; items: Service[] }> = [];
          for (const cat of serviceCategories) {
            const items = services.filter((s) => s.category === cat);
            if (items.length) groups.push({ label: cat, items });
          }
          const uncategorized = services.filter((s) => !s.category);
          if (uncategorized.length) groups.push({ label: "Sin categoria", items: uncategorized });

          return (
            <div className="space-y-7">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-dark">{g.label}</h3>
                    <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-semibold text-brand-blue">{g.items.length}</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-brand-blue/25 to-transparent" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {g.items.map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Right: Cart */}
      <div className="flex w-full flex-col border-t border-gray-100 bg-gradient-to-b from-brand-white to-brand-light lg:max-h-screen lg:w-[440px] lg:border-l lg:border-t-0">
        {/* Encabezado: titulo + total en vivo, profesional y cliente */}
        <div className="space-y-3 border-b border-gray-100 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-base font-bold leading-none text-brand-dark">Nueva venta</h2>
                <p className="mt-1 text-[11px] text-brand-gray">
                  {cart.length === 0 ? "Sin items" : `${cart.reduce((s, c) => s + c.quantity, 0)} item${cart.reduce((s, c) => s + c.quantity, 0) > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            {cart.length > 0 && (
              <span className="text-xl font-extrabold tracking-tight text-brand-blue tabular-nums">{formatCurrency(total)}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {standby ? (
              <div className="flex items-center rounded-xl border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs font-semibold text-brand-blue">
                {standby.barber.name}
              </div>
            ) : (
              <select
                value={selectedBarber}
                onChange={(e) => setSelectedBarber(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
              >
                <option value="">Profesional *</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <div className="relative">
              <input
                type="text"
                placeholder="Cliente (nombre, telefono)..."
                value={clientSearch}
                onChange={async (e) => {
                  const val = e.target.value;
                  setClientSearch(val);
                  setSelectedClient("");
                  // Server-side search when 2+ chars typed
                  if (val.length >= 2) {
                    const t = getActiveTenantId();
                    const searchParams = new URLSearchParams();
                    if (t) searchParams.set("tenantId", t);
                    searchParams.set("search", val);
                    searchParams.set("limit", "10");
                    const res = await fetch(`/api/clients?${searchParams.toString()}`);
                    const data = await res.json();
                    setClients(data.clients || []);
                  }
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
              />
              {clientSearch.trim().length >= 2 && !selectedClient && (() => {
                const typed = clientSearch.trim();
                const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                const exactMatch = clients.some((c) => norm(c.name) === norm(typed));
                // Celular y correo son obligatorios: sin ellos no hay registro ni datos del cliente.
                const phoneOk = newClientPhone.replace(/\D/g, "").length >= 8;
                const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClientEmail.trim());
                const formOk = phoneOk && emailOk;
                const addClient = async () => {
                  if (savingClient || !typed) return;
                  if (!formOk) {
                    showToast(!phoneOk ? "Ingresa un celular valido" : "Ingresa un correo valido", "error");
                    return;
                  }
                  setSavingClient(true);
                  try {
                    const t = getActiveTenantId();
                    const res = await fetch("/api/clients", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: typed, phone: newClientPhone.trim(), email: newClientEmail.trim(), source: newClientSource, ...(t ? { tenantId: t } : {}) }),
                    });
                    const created = await res.json();
                    if (!res.ok || !created?.id) {
                      showToast(created?.error || "No se pudo crear el cliente", "error");
                    } else {
                      setClients((prev) => [created, ...prev]);
                      setSelectedClient(created.id);
                      setClientSearch(created.name);
                      setClientPoints(0);
                      setAddingClient(false);
                      setNewClientPhone("");
                      setNewClientEmail("");
                      setNewClientSource("walk_in");
                      showToast(`Cliente "${created.name}" agregado`, "success");
                    }
                  } finally {
                    setSavingClient(false);
                  }
                };
                return (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {clients.slice(0, 8).map((c) => (
                      <button key={c.id} onClick={async () => {
                        setSelectedClient(c.id); setClientSearch(c.name); setAddingClient(false);
                        const res = await fetch(`/api/clients/${c.id}`);
                        const data = await res.json();
                        setClientPoints(data?.client?.loyalty_points || data?.loyalty_points || 0);
                      }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100">
                        {/* Nombre + celular + correo: asi se distinguen dos clientes con el mismo nombre. */}
                        <span className="block font-semibold text-gray-800">{c.name}</span>
                        <span className="block text-[11px] text-gray-500">
                          {c.phone ? c.phone : <span className="text-amber-600">Sin celular</span>}
                          {c.email ? ` · ${c.email}` : ""}
                          {c.created_at ? ` · desde ${new Date(c.created_at).toLocaleDateString("es-CL", { month: "short", year: "numeric" })}` : ""}
                        </span>
                      </button>
                    ))}
                    {!exactMatch && (
                      addingClient ? (
                        <div className="p-2 border-t border-gray-100 space-y-2">
                          <p className="text-[11px] text-gray-500">Nuevo cliente: <span className="font-semibold text-gray-800">{typed}</span></p>
                          <input
                            type="tel"
                            autoFocus
                            required
                            value={newClientPhone}
                            onChange={(e) => setNewClientPhone(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClient(); } }}
                            placeholder="Celular *"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
                          />
                          <input
                            type="email"
                            required
                            value={newClientEmail}
                            onChange={(e) => setNewClientEmail(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClient(); } }}
                            placeholder="Correo *"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
                          />
                          <SourceSelect
                            value={newClientSource}
                            onChange={setNewClientSource}
                            tenantId={getActiveTenantId()}
                            ariaLabel="¿Cómo nos conoció?"
                            walkInLabel="¿Cómo nos conoció? · Pasó por fuera"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
                          />
                          <div className="flex gap-2">
                            <button onClick={addClient} disabled={savingClient || !formOk}
                              className="flex-1 px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                              {savingClient ? "Añadiendo..." : "Añadir"}
                            </button>
                            <button onClick={() => { setAddingClient(false); setNewClientPhone(""); setNewClientEmail(""); }}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAddingClient(true)}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-brand-blue hover:bg-gray-100 border-t border-gray-100">
                          + Añadir "{typed}" como cliente nuevo
                        </button>
                      )
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Loyalty points - compact */}
          {selectedClient && (() => {
            const sc = clients.find((c) => c.id === selectedClient);
            if (!sc) return null;
            return (
              <p className="text-[11px] text-gray-500">
                {sc.phone || <span className="text-amber-600">Sin celular</span>}{sc.email ? ` · ${sc.email}` : ""}
              </p>
            );
          })()}
          {selectedClient && clientPoints > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-400/15 to-transparent px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600"><Star className="h-3.5 w-3.5" fill="currentColor" />{clientPoints - redeemedPoints} pts</span>
              {redeemedPoints === 0 ? (
                <button onClick={() => { const max = Math.min(clientPoints * 100, subtotal); setRedeemedPoints(Math.floor(max / 100)); setDiscount(Math.floor(max / 100) * 100); }}
                  disabled={subtotal === 0} className="text-[10px] px-2 py-1 bg-brand-blue text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  Canjear
                </button>
              ) : (
                <button onClick={() => { setRedeemedPoints(0); setDiscount(0); }}
                  className="text-[10px] px-2 py-1 border border-red-300 text-red-500 rounded-md hover:bg-red-50">
                  Quitar (-{formatCurrency(redeemedPoints * 100)})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Items de la venta */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {cart.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-brand-blue/15 blur-xl" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-brand-blue/40 bg-brand-blue/5">
                  <ShoppingBag className="h-7 w-7 text-brand-blue" strokeWidth={1.5} />
                </div>
              </div>
              <p className="font-semibold text-brand-dark">Carrito vacío</p>
              <p className="mt-1 max-w-[210px] text-xs text-brand-gray">Toca un servicio o producto para agregarlo a la venta</p>
            </div>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gray">Detalle</span>
                <button onClick={() => setCart([])} className="text-[11px] font-medium text-red-400 transition-colors hover:text-red-500">Vaciar todo</button>
              </div>
              {cart.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-2.5 pr-3 transition-colors hover:border-brand-blue/30"
                >
                  <Monogram name={item.name} tone={item.type === "service" ? "teal" : "amber"} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-dark">{item.name}</p>
                    <p className="text-[11px] text-brand-gray tabular-nums">{formatCurrency(Number(item.price))} c/u</p>
                    <div className="mt-1.5 inline-flex items-center rounded-full border border-gray-200 bg-brand-light">
                      <button onClick={() => updateQuantity(item.id, item.type, -1)} aria-label="Restar"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-brand-blue/15 hover:text-brand-blue">
                        <Minus className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                      <span className="w-7 text-center text-xs font-bold text-brand-dark tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.type, 1)} aria-label="Sumar"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-brand-blue/15 hover:text-brand-blue">
                        <Plus className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between gap-3 self-stretch">
                    <button onClick={() => removeFromCart(item.id, item.type)} title="Quitar" aria-label="Quitar"
                      className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <p className="text-sm font-bold text-brand-dark tabular-nums">{formatCurrency(Number(item.price) * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-gray-100 bg-brand-white p-4">
          {/* Cupon + descuento manual */}
          <div className="space-y-1.5">
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-gray" strokeWidth={1.75} />
              <input
                type="text"
                placeholder="Código de cupón"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-24 text-sm outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
              />
              <button
                onClick={applyCoupon}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-brand-blue/10 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue hover:text-white"
              >
                Aplicar
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowPinModal(true)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-gray transition-colors hover:bg-orange-500/10 hover:text-orange-500"
              >
                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} /> Descuento manual (PIN admin)
              </button>
              {discount > 0 && (
                <button onClick={() => setDiscount(0)} className="text-xs font-medium text-red-500 hover:underline">
                  Quitar descuento
                </button>
              )}
            </div>
          </div>
          {couponError && <p className="text-xs text-red-500">{couponError}</p>}

          {/* Resumen tipo recibo */}
          <div className="rounded-2xl border border-gray-100 bg-brand-light/60 px-4 py-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-gray">Subtotal</span>
                <span className="font-medium text-brand-dark tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span>
                  <span className="font-medium tabular-nums">-{formatCurrency(discount)}</span>
                </div>
              )}
            </div>
            <div className="my-3 border-t border-dashed border-gray-300" />
            <div className="flex items-end justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider text-brand-gray">Total</span>
              <span className="text-3xl font-black leading-none tracking-tight text-brand-dark tabular-nums">{formatCurrency(total)}</span>
            </div>
            {/* Tip is asked on the terminal itself, after the card payment. See the
                "Cliente agrego propina?" step in the success flow below. */}
          </div>

          {/* Payment Methods */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gray">Método de pago</span>
              <button onClick={() => setSplitMode(!splitMode)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${splitMode ? "bg-brand-blue/15 text-brand-blue" : "bg-black/5 text-brand-gray hover:text-brand-dark dark:bg-white/10"}`}>
                {splitMode ? "Pago dividido ✓" : "Dividir pago"}
              </button>
            </div>

            {!splitMode ? (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "cash", label: "Efectivo", Icon: Banknote },
                  { key: "debit_card", label: "Débito", Icon: CreditCard },
                  { key: "credit_card", label: "Crédito", Icon: CreditCard },
                  { key: "transfer", label: "Transfer", Icon: ArrowLeftRight },
                ].map((m) => {
                  const selected = paymentMethod === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setPaymentMethod(m.key)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                        selected
                          ? "border-brand-blue bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/40"
                          : "border-gray-200 bg-white text-brand-dark hover:border-brand-blue/40"
                      }`}
                    >
                      <m.Icon className="h-4 w-4" strokeWidth={1.75} />
                      {m.label}
                      {selected && <Check className="ml-auto h-4 w-4" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {splitPayments.map((sp, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={sp.method}
                      onChange={(e) => {
                        const updated = [...splitPayments];
                        updated[i].method = e.target.value;
                        setSplitPayments(updated);
                      }}
                      className="border rounded-lg px-2 py-1.5 text-sm flex-1">
                      <option value="cash">Efectivo</option>
                      <option value="debit_card">Debito</option>
                      <option value="credit_card">Credito</option>
                      <option value="transfer">Transfer</option>
                    </select>
                    <input type="number" placeholder="$" value={sp.amount}
                      onChange={(e) => {
                        const updated = [...splitPayments];
                        updated[i].amount = e.target.value;
                        setSplitPayments(updated);
                      }}
                      className="border rounded-lg px-2 py-1.5 text-sm w-24 text-right" />
                    {splitPayments.length > 2 && (
                      <button onClick={() => setSplitPayments(splitPayments.filter((_, idx) => idx !== i))}
                        className="text-red-400 text-xs">✕</button>
                    )}
                  </div>
                ))}
                {splitPayments.length < 4 && (
                  <button onClick={() => setSplitPayments([...splitPayments, { method: "cash", amount: "" }])}
                    className="text-xs text-blue-600 hover:underline">+ Agregar metodo</button>
                )}
                {(() => {
                  const splitTotal = splitPayments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
                  const diff = total - splitTotal;
                  return diff !== 0 ? (
                    <p className={`text-xs ${diff > 0 ? "text-red-500" : "text-orange-500"}`}>
                      {diff > 0 ? `Faltan ${formatCurrency(diff)}` : `Excede en ${formatCurrency(Math.abs(diff))}`}
                    </p>
                  ) : <p className="text-xs text-green-600 font-medium">✓ Pago cuadra</p>;
                })()}
              </div>
            )}
          </div>

          {/* MP Terminal indicator — shows for a single card payment AND for a split
              payment that includes a debit/credit portion (each portion is charged on
              the terminal, one at a time, before the sale is recorded). */}
          {selectedBarber && (
            (!splitMode && (paymentMethod === "debit_card" || paymentMethod === "credit_card")) ||
            (splitMode && splitPayments.some((p) => (p.method === "debit_card" || p.method === "credit_card") && parseInt(p.amount) > 0))
          ) && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <span className="text-blue-600 text-sm">💳</span>
              <span className="text-xs text-blue-700 flex-1">
                {splitChargeProgress || `Terminal ${cardProvider === "tuu" ? "TUU" : "MP"} se activara al cobrar`}
              </span>
              <button
                onClick={async () => {
                  await fetch(cardProvider === "tuu" ? "/api/tuu/cancel" : "/api/mercadopago/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ barberId: selectedBarber, cancelAll: true }),
                  });
                  showToast("Cola limpiada", "success");
                }}
                className="text-[10px] px-2 py-1 bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
              >
                Limpiar cola
              </button>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={
              !selectedBarber || cart.length === 0 || processing || mpPaymentStatus === "waiting" ||
              (splitMode
                ? splitPayments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0) !== total
                : !paymentMethod)
            }
            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-brand-blue to-emerald-500 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-blue/25 transition-all hover:brightness-110 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
          >
            <span className="flex items-center justify-center gap-2">
              {processing ? "Procesando..." : mpPaymentStatus === "waiting" ? "Esperando pago en máquina..." : (
                <>
                  Cobrar{total > 0 && <span className="tabular-nums">{formatCurrency(total)}</span>}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPinModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Autorizar Descuento</h3>
            <p className="text-sm text-gray-500 mb-4">Ingresa el PIN de administrador</p>

            <div className="space-y-3">
              {/* Discount amount */}
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder={manualDiscountType === "percent" ? "%" : "$"}
                  value={manualDiscountAmount}
                  onChange={(e) => setManualDiscountAmount(e.target.value)}
                  className="flex-1 border-2 rounded-xl px-3 py-2.5 text-sm focus:border-orange-400 outline-none"
                  autoFocus
                />
                <div className="flex bg-gray-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setManualDiscountType("fixed")}
                    className={`px-3 py-2 text-sm font-medium ${manualDiscountType === "fixed" ? "bg-orange-600 text-white" : "text-gray-600"}`}
                  >$</button>
                  <button
                    onClick={() => setManualDiscountType("percent")}
                    className={`px-3 py-2 text-sm font-medium ${manualDiscountType === "percent" ? "bg-orange-600 text-white" : "text-gray-600"}`}
                  >%</button>
                </div>
              </div>

              {/* Preview */}
              {manualDiscountAmount && (
                <p className="text-xs text-gray-500">
                  Descuento: {formatCurrency(
                    manualDiscountType === "percent"
                      ? Math.round(subtotal * (parseInt(manualDiscountAmount) || 0) / 100)
                      : parseInt(manualDiscountAmount) || 0
                  )} → Total queda en {formatCurrency(
                    subtotal - Math.min(
                      manualDiscountType === "percent"
                        ? Math.round(subtotal * (parseInt(manualDiscountAmount) || 0) / 100)
                        : parseInt(manualDiscountAmount) || 0,
                      subtotal
                    )
                  )}
                </p>
              )}

              {/* PIN input */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">PIN Admin (4 digitos)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                  placeholder="••••"
                  className="w-full border-2 rounded-xl px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:border-orange-400 outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && pinInput.length === 4) applyManualDiscount(); }}
                />
              </div>

              {pinError && <p className="text-red-500 text-xs text-center">{pinError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }}
                  className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                >Cancelar</button>
                <button
                  onClick={applyManualDiscount}
                  disabled={pinInput.length !== 4 || !manualDiscountAmount}
                  className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                >Autorizar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Tip modal — shown AFTER a card payment is approved, since the client adds the
          tip on the terminal itself. This is purely informational: nothing is charged
          again from here, we just record what the client added on the machine. */}
      {showTipModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="text-3xl mb-3">{tipKind === "card" ? "💳" : "💵"}</div>
            <h3 className="text-lg font-bold text-brand-dark">{tipKind === "card" ? "Cliente agrego propina?" : "¿El cliente dejó propina?"}</h3>
            <p className="text-sm text-brand-gray mt-1 mb-4">
              {tipKind === "card"
                ? "Preguntale al cliente si agrego propina en la maquina. Esto solo se registra, no se cobra de nuevo."
                : "Se registra para el profesional que atendió. No se suma al cobro."}
              {ledgerOn && " Va 100% al profesional."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1 mb-3">
              {[0, ...(ledgerOn ? [Math.round(successAmount * 0.1 / 100) * 100] : []), 1000, 2000, 5000].filter((t, i, a) => a.indexOf(t) === i).map((t) => (
                <button key={t} onClick={() => setTipInput(t ? String(t) : "")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${(parseInt(tipInput) || 0) === t ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {t === 0 ? "Sin propina" : ledgerOn && t > 0 && t === Math.round(successAmount * 0.1 / 100) * 100 ? `10% · ${formatCurrency(t)}` : `$${(t/1000).toFixed(0)}K`}
                </button>
              ))}
            </div>
            <input type="number" min="0" step="1" value={tipInput}
              onChange={(e) => setTipInput(e.target.value)}
              placeholder="Otro monto ($)"
              className="w-full border rounded-xl px-3 py-2.5 text-sm text-center mb-4" />
            <button onClick={() => recordTip(parseInt(tipInput) || 0)}
              className="w-full py-2.5 bg-brand-blue text-white rounded-xl font-medium hover:bg-brand-blue/90">
              {parseInt(tipInput) > 0 ? `Registrar propina de ${formatCurrency(parseInt(tipInput))}` : "Continuar sin propina"}
            </button>
          </div>
        </div>
      )}

      {/* Success Celebration Modal (Nico, 29-sep: mas estilo — confeti en abanico, check animado, monto que sube) */}
      {showSuccessModal && <SaleCelebration amount={successAmount} onClose={() => setShowSuccessModal(false)} />}
      <CashReductionPrompt trigger={saleCounter} tenantId={tenant?.id} />

      {/* MercadoPago Payment Modal */}
      {mpPaymentStatus !== "idle" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
            {mpPaymentStatus === "waiting" && (
              <>
                <div className="w-20 h-20 mx-auto mb-5 relative">
                  <div className="absolute inset-0 border-4 border-brand-blue/20 rounded-full" />
                  <div className="absolute inset-0 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl">💳</span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-brand-dark">Esperando pago...</h3>
                <p className="text-sm text-brand-gray mt-2">Pasa la tarjeta en la maquina Point</p>
                <p className="text-xs text-brand-gray mt-4">Monto: <strong className="text-brand-dark">{formatCurrency(currentChargeAmount || total)}</strong></p>
                {splitChargeProgress && <p className="text-xs text-blue-600 mt-1">{splitChargeProgress}</p>}
                <button
                  onClick={() => recheckCharge?.()}
                  disabled={rechecking}
                  className="mt-6 w-full py-2.5 bg-brand-blue text-white rounded-xl text-sm font-bold hover:bg-brand-blue/90 disabled:opacity-50"
                >
                  {rechecking ? "Consultando..." : "Ya pago / Reconsultar"}
                </button>
                <p className="text-[10px] text-brand-gray mt-2">Si la maquina ya cobro pero aca sigue esperando, toca este boton.</p>
                <button onClick={() => { cancelCurrentCharge?.(); }}
                  className="mt-3 text-xs text-brand-gray hover:text-red-500">Cancelar</button>
              </>
            )}

            {mpPaymentStatus === "approved" && (
              <>
                <div className="w-20 h-20 mx-auto mb-5 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-green-700">Pago aprobado!</h3>
                <p className="text-sm text-brand-gray mt-2">Procesando venta...</p>
              </>
            )}

            {/* No final answer from the terminal (timeout / rate limit / network).
                The charge may have gone through, so ask instead of discarding it. */}
            {mpPaymentStatus === "unconfirmed" && (
              <>
                <div className="w-20 h-20 mx-auto mb-5 bg-amber-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-2.032-1.5-2.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-amber-700">No pudimos confirmar el pago</h3>
                <p className="text-sm text-brand-gray mt-2">
                  Revisa la pantalla de la maquina. <strong>Puede que si haya cobrado.</strong>
                </p>
                <p className="text-xs text-brand-gray mt-3">
                  Monto: <strong className="text-brand-dark">{formatCurrency(currentChargeAmount || total)}</strong>
                </p>
                <div className="mt-5 space-y-2">
                  <button
                    onClick={() => confirmUnclearCharge?.(true)}
                    className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700"
                  >
                    La maquina SI cobro — registrar venta
                  </button>
                  <button
                    onClick={() => confirmUnclearCharge?.(false)}
                    className="w-full py-2.5 border border-gray-200 text-brand-gray rounded-xl text-sm font-medium hover:bg-gray-50"
                  >
                    No cobro — no registrar
                  </button>
                </div>
              </>
            )}

            {mpPaymentStatus === "rejected" && (
              <>
                <div className="w-20 h-20 mx-auto mb-5 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-red-700">Pago rechazado</h3>
                <p className="text-sm text-brand-gray mt-2">Intenta de nuevo o usa otro metodo de pago</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
