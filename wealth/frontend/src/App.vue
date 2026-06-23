<template>
  <main class="page">
    <section class="hero">
      <h1>WEALTH PoC</h1>
      <p>Standalone deal, signing, and ownership flow.</p>
    </section>

    <section class="panel">
      <h2>Create deal</h2>
      <form @submit.prevent="handleCreateDeal" class="form-grid">
        <input v-model="createDealForm.name" placeholder="Deal name" />
        <input v-model="createDealForm.property_address" placeholder="Property address" />
        <input v-model="createDealForm.token_symbol" placeholder="Token symbol" />
        <button type="submit">Create deal</button>
      </form>

      <div class="preset-templates" style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
        <h3 style="margin-top: 0; margin-bottom: 1rem;">Or load a preset template:</h3>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button type="button" data-test="load-b3-template" @click="loadTemplate(B3_TEMPLATE)">
            Load YILAN-B3 (4 Signers)
          </button>
          <button type="button" data-test="load-b5-template" @click="loadTemplate(B5_TEMPLATE)">
            Load YILAN-B5 (7 Signers)
          </button>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Load deal status</h2>
      <div class="form-grid">
        <input v-model="dealId" placeholder="Deal ID" />
        <button data-test="refresh-deal" @click="refreshDeal">Refresh status</button>
      </div>
    </section>

    <section class="panel" v-if="dealId">
      <h2>Add participant</h2>
      <form @submit.prevent="handleAddParticipant" class="form-grid">
        <input v-model="participantForm.display_name" placeholder="Display name" />
        <input v-model="participantForm.email" placeholder="Email" />
        <button type="submit">Add participant</button>
      </form>
    </section>

    <section class="panel" v-if="dealId">
      <h2>Signer flow</h2>
      <form data-test="start-session-form" @submit.prevent="handleCreateSignerSession" class="form-grid">
        <input v-model="signerForm.participant_id" placeholder="Signer participant ID" />
        <button data-test="start-session" type="submit">Start signer session</button>
      </form>

      <form data-test="wallet-prep-form" @submit.prevent="handlePrepareWallet" class="form-grid">
        <input v-model="signerForm.session_id" placeholder="Signer session ID" />
        <input v-model="signerForm.wallet_address" placeholder="Signer wallet address" />
        <button data-test="wallet-prep" type="submit">Prepare wallet</button>
      </form>

      <div class="form-grid compact-grid">
        <input v-model="signerForm.provider" placeholder="Signing provider" />
        <input v-model="signerForm.envelope_id" placeholder="Envelope ID" />
        <button data-test="signing-start" type="button" @click="handleStartSigning">Start signing</button>
      </div>

      <form @submit.prevent="handleCompleteSigning" class="form-grid">
        <input v-model="signerForm.document_name" placeholder="Document name" />
        <input v-model="signerForm.document_hash" placeholder="Document hash" />
        <button type="submit">Complete signing</button>
      </form>
    </section>

    <section class="panel" v-if="dealId">
      <h2>Mint ownership</h2>
      <form @submit.prevent="handleMint" class="form-grid">
        <input v-model="mintForm.participant_id" placeholder="Participant ID" />
        <input v-model="mintForm.amount" placeholder="Amount" />
        <input v-model.number="mintForm.asset_id" type="number" placeholder="Asset ID" />
        <label class="checkbox-row">
          <input v-model="mintForm.on_chain" type="checkbox" />
          On-chain
        </label>
        <button type="submit">Mint ownership</button>
      </form>
    </section>

    <section class="panel status-panel">
      <h2>Status</h2>
      <p v-if="message" class="message">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="deal" class="status-grid">
        <div><strong>Deal ID:</strong> {{ deal.id }}</div>
        <div><strong>Deal name:</strong> {{ deal.name }}</div>
        <div><strong>Agreement status:</strong> {{ deal.signing_status }}</div>
        <div><strong>Ownership status:</strong> {{ deal.mint_status }}</div>
        <div><strong>Participants:</strong> {{ deal.participants?.length || 0 }}</div>
        <div><strong>Ownership rows:</strong> {{ deal.ownership?.length || 0 }}</div>
      </div>

      <div v-if="deal?.participants?.length" class="table-wrap">
        <h3>Participants</h3>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Wallet</th><th>Signing</th></tr></thead>
          <tbody>
            <tr v-for="participant in deal.participants" :key="participant.id">
              <td>{{ participant.id }}</td>
              <td>{{ participant.display_name }}</td>
              <td>{{ participant.role }}</td>
              <td>{{ participant.wallet_address || '—' }}</td>
              <td>{{ participant.signing_status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="deal?.signatures?.length" class="table-wrap">
        <h3>Signature history</h3>
        <table>
          <thead><tr><th>Document</th><th>Provider</th><th>Envelope</th><th>Evidence</th><th>Completed</th></tr></thead>
          <tbody>
            <tr v-for="signature in deal.signatures" :key="signature.id">
              <td>{{ signature.document_name }}</td>
              <td>{{ signature.provider }}</td>
              <td>{{ signature.envelope_id || '—' }}</td>
              <td>{{ signature.evidence_key || '—' }}</td>
              <td>{{ signature.completed_at }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="deal?.audit_events?.length" class="table-wrap">
        <h3>Audit history</h3>
        <table>
          <thead><tr><th>Event</th><th>Participant</th><th>Payload</th><th>Created</th></tr></thead>
          <tbody>
            <tr v-for="event in deal.audit_events" :key="event.id">
              <td>{{ event.event_type }}</td>
              <td>{{ event.participant_id || '—' }}</td>
              <td>{{ event.payload_json }}</td>
              <td>{{ event.created_at }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="deal?.ownership?.length" class="table-wrap">
        <h3>Ownership ledger</h3>
        <table>
          <thead><tr><th>ID</th><th>Asset</th><th>Amount</th><th>Status</th><th>Verification</th></tr></thead>
          <tbody>
            <tr v-for="row in deal.ownership" :key="row.id">
              <td>{{ row.id }}</td>
              <td>{{ row.asset_id }}</td>
              <td>{{ row.amount }}</td>
              <td>{{ row.status }}</td>
              <td>
                <a v-if="row.tx_hash" :href="getSepoliaTxUrl(row.tx_hash)" target="_blank" rel="noreferrer">View on Sepolia</a>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { api } from './api';
import type { WealthDeal, WealthSignerSession } from './types';

const dealId = ref('');
const deal = ref<WealthDeal | null>(null);
const message = ref('');
const error = ref('');
const signerSession = ref<WealthSignerSession | null>(null);

const createDealForm = reactive({
  name: '',
  property_address: '',
  token_symbol: '',
});

const participantForm = reactive({
  display_name: '',
  email: '',
});

const signerForm = reactive({
  participant_id: '',
  session_id: '',
  wallet_address: '',
  provider: 'sandbox-esign',
  envelope_id: 'env-demo',
  document_name: 'Purchase Agreement',
  document_hash: 'sha256-demo-hash',
});

const mintForm = reactive({
  participant_id: '',
  amount: '1',
  asset_id: 1,
  on_chain: true,
});

function resetFeedback() {
  message.value = '';
  error.value = '';
}

function assignSignerSession(session: WealthSignerSession) {
  signerSession.value = session;
  signerForm.session_id = session.session_id;
  mintForm.participant_id = session.participant_id;
}

function getSepoliaTxUrl(txHash: string) {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

async function refreshDeal() {
  if (!dealId.value.trim()) return;
  resetFeedback();
  try {
    deal.value = await api.getDeal(dealId.value.trim());
    message.value = 'Deal status loaded.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to load deal.';
  }
}

async function handleCreateDeal() {
  resetFeedback();
  try {
    const created = await api.createDeal(createDealForm);
    dealId.value = created.id;
    await refreshDeal();
    message.value = 'Deal created.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to create deal.';
  }
}

async function handleAddParticipant() {
  resetFeedback();
  try {
    const participant = await api.addParticipant(dealId.value, participantForm);
    signerForm.participant_id = participant.id;
    mintForm.participant_id = participant.id;
    await refreshDeal();
    message.value = 'Participant added.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to add participant.';
  }
}

async function handleCreateSignerSession() {
  resetFeedback();
  try {
    const session = await api.createSignerSession(dealId.value, { participant_id: signerForm.participant_id });
    assignSignerSession(session);
    message.value = 'Signer session started.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to start signer session.';
  }
}

async function handlePrepareWallet() {
  resetFeedback();
  try {
    await api.prepareWallet(dealId.value, {
      participant_id: signerForm.participant_id,
      session_id: signerForm.session_id,
      wallet_address: signerForm.wallet_address,
    });
    await refreshDeal();
    message.value = 'Wallet prepared.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to prepare wallet.';
  }
}

async function handleStartSigning() {
  resetFeedback();
  try {
    await api.startSigning(dealId.value, {
      participant_id: signerForm.participant_id,
      session_id: signerForm.session_id,
      provider: signerForm.provider,
      envelope_id: signerForm.envelope_id,
    });
    message.value = 'Signing started.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to start signing.';
  }
}

async function handleCompleteSigning() {
  resetFeedback();
  try {
    await api.completeSigning(dealId.value, {
      participant_id: signerForm.participant_id,
      session_id: signerForm.session_id,
      document_name: signerForm.document_name,
      document_hash: signerForm.document_hash,
      provider: signerForm.provider,
      envelope_id: signerForm.envelope_id,
    });
    await refreshDeal();
    message.value = 'Signing completed.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to complete signing.';
  }
}

async function handleMint() {
  resetFeedback();
  try {
    await api.mintOwnership(dealId.value, mintForm);
    await refreshDeal();
    message.value = 'Ownership minted.';
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to mint ownership.';
  }
}

interface DealTemplate {
  deal: {
    name: string;
    property_address: string;
    token_symbol: string;
  };
  participants: Array<{
    display_name: string;
    role: string;
    share_pct: number;
    cash_amount: string;
    loan_amount: string;
    email: string;
  }>;
}

const B3_TEMPLATE: DealTemplate = {
  deal: { name: "宜蘭建蘭北路 B3 標的", property_address: "宜蘭縣宜蘭市建蘭北路315之2號", token_symbol: "YILAN-B3" },
  participants: [
    { display_name: "周文海 (甲方)", role: "signer", share_pct: 0.0833, cash_amount: "1,000,000", loan_amount: "2,554,167", email: "zhou@wealth.local" },
    { display_name: "吳岳庭 (乙方)", role: "signer", share_pct: 0.2500, cash_amount: "3,000,000", loan_amount: "7,662,500", email: "wu@wealth.local" },
    { display_name: "徐志仁 (丙方)", role: "signer", share_pct: 0.5000, cash_amount: "6,000,000", loan_amount: "15,325,000", email: "xu@wealth.local" },
    { display_name: "許丕政 (丁方)", role: "signer", share_pct: 0.1667, cash_amount: "2,000,000", loan_amount: "5,108,333", email: "xu-pi@wealth.local" }
  ]
};

const B5_TEMPLATE: DealTemplate = {
  deal: { name: "宜蘭建業段 B5 標的", property_address: "宜蘭縣宜蘭市建業段00837-000地號", token_symbol: "YILAN-B5" },
  participants: [
    { display_name: "吳萬益 (甲方)", role: "signer", share_pct: 0.1666, cash_amount: "3,000,000", loan_amount: "4,831,400", email: "wu-wan@wealth.local" },
    { display_name: "顏明滄 (乙方)", role: "signer", share_pct: 0.1666, cash_amount: "3,000,000", loan_amount: "4,831,400", email: "yen@wealth.local" },
    { display_name: "楊翊萱 (丙方)", role: "signer", share_pct: 0.2167, cash_amount: "3,900,000", loan_amount: "6,284,300", email: "yang@wealth.local" },
    { display_name: "周秀麗 (丁方)", role: "signer", share_pct: 0.1111, cash_amount: "2,000,000", loan_amount: "3,221,900", email: "zhou-xl@wealth.local" },
    { display_name: "吳蕙蘭 (戊方)", role: "signer", share_pct: 0.0667, cash_amount: "1,200,000", loan_amount: "1,934,300", email: "wu-hl@wealth.local" },
    { display_name: "鄭國堂 (己方)", role: "signer", share_pct: 0.0556, cash_amount: "1,000,000", loan_amount: "1,612,400", email: "zheng@wealth.local" },
    { display_name: "胡舜元 (庚方)", role: "signer", share_pct: 0.2167, cash_amount: "3,900,000", loan_amount: "6,284,300", email: "hu@wealth.local" }
  ]
};

async function loadTemplate(template: DealTemplate) {
  resetFeedback();
  try {
    const dealObj = await api.createDeal(template.deal);
    dealId.value = dealObj.id;

    for (const p of template.participants) {
      await api.addParticipant(dealObj.id, p);
    }

    await refreshDeal();
    message.value = `${template.deal.name} presets loaded successfully.`;
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to load template.';
  }
}

</script>
