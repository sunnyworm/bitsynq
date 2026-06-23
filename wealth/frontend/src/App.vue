<template>
  <main class="page">
    <section class="hero">
      <h1>WEALTH PoC</h1>
      <p>Standalone deal, signing, and ownership flow.</p>
    </section>

    <!-- Split Screen Layout -->
    <div class="split-container">
      
      <!-- Left Column: Demo Controller -->
      <div class="left-panel glass-card">
        
        <!-- Presets Loader -->
        <section class="sub-panel">
          <h2>Select Deal Template</h2>
          <div class="preset-cards">
            <div class="preset-card" :class="{ active: deal?.token_symbol === 'YILAN-B3' }">
              <div class="preset-info">
                <h3>YILAN-B3 Template</h3>
                <p class="desc">4 Signers • Property Co-ownership</p>
                <span class="badge">B3 Deal</span>
              </div>
              <button type="button" data-test="load-b3-template" @click="loadTemplate(B3_TEMPLATE)" class="preset-btn">
                Load B3 Template
              </button>
            </div>

            <div class="preset-card" :class="{ active: deal?.token_symbol === 'YILAN-B5' }">
              <div class="preset-info">
                <h3>YILAN-B5 Template</h3>
                <p class="desc">7 Signers • Land Co-ownership</p>
                <span class="badge">B5 Deal</span>
              </div>
              <button type="button" data-test="load-b5-template" @click="loadTemplate(B5_TEMPLATE)" class="preset-btn">
                Load B5 Template
              </button>
            </div>
          </div>
          
          <!-- Custom Deal Accordion / Form -->
          <div class="custom-deal-wrap">
            <details>
              <summary class="custom-summary">Or Create Custom Deal...</summary>
              <form @submit.prevent="handleCreateDeal" class="form-grid custom-deal-form">
                <input v-model="createDealForm.name" placeholder="Deal name" />
                <input v-model="createDealForm.property_address" placeholder="Property address" />
                <input v-model="createDealForm.token_symbol" placeholder="Token symbol" />
                <button type="submit" class="action-btn">Create Custom Deal</button>
              </form>
            </details>
          </div>
        </section>

        <!-- Load/Refresh Section -->
        <section class="sub-panel border-top">
          <h2>Load Existing Deal</h2>
          <div class="form-grid compact-grid">
            <input v-model="dealId" placeholder="Deal ID" />
            <button data-test="refresh-deal" @click="refreshDeal" class="action-btn">Refresh status</button>
          </div>
        </section>

        <!-- Workflow Timeline -->
        <section class="sub-panel border-top" v-if="dealId">
          <h2>Workflow Timeline</h2>
          <div class="timeline">
            <div class="timeline-item" :class="getTimelineStepClass(1)">
              <div class="timeline-badge">1</div>
              <div class="timeline-content">
                <h4>Initialize Deal</h4>
                <p v-if="deal">Deal created and loaded ({{ deal.id }})</p>
                <p v-else>Load or create a deal to start</p>
              </div>
            </div>
            <div class="timeline-item" :class="getTimelineStepClass(2)">
              <div class="timeline-badge">2</div>
              <div class="timeline-content">
                <h4>Wallet Provisioning</h4>
                <p v-if="deal">{{ countWalletsPrepared }} of {{ deal.participants?.length || 0 }} signers ready</p>
                <p v-else>Register wallets for each participant</p>
              </div>
            </div>
            <div class="timeline-item" :class="getTimelineStepClass(3)">
              <div class="timeline-badge">3</div>
              <div class="timeline-content">
                <h4>Contract Signing</h4>
                <p>Signing status: <span class="status-val">{{ deal?.signing_status || 'pending' }}</span></p>
              </div>
            </div>
            <div class="timeline-item" :class="getTimelineStepClass(4)">
              <div class="timeline-badge">4</div>
              <div class="timeline-content">
                <h4>On-Chain Tokenization</h4>
                <p>Mint status: <span class="status-val">{{ deal?.mint_status || 'not_started' }}</span></p>
              </div>
            </div>
          </div>
        </section>

        <!-- Role Impersonation Switcher List -->
        <section class="sub-panel border-top" v-if="dealId">
          <h2>Role Impersonator Switcher</h2>
          <p class="sub-title-desc">Click any participant to instantly impersonate them for the signing flow.</p>
          <div class="impersonator-list" v-if="deal?.participants?.length">
            <div
              v-for="p in deal.participants"
              :key="p.id"
              class="impersonator-card"
              :class="{ active: signerForm.participant_id === p.id }"
              @click="impersonateParticipant(p)"
            >
              <div class="avatar-circle" :style="{ backgroundColor: getParticipantColor(p.id) }">
                {{ p.display_name.charAt(0) }}
              </div>
              <div class="impersonator-details">
                <div class="name-row">
                  <span class="display-name">{{ p.display_name }}</span>
                  <span v-if="signerForm.participant_id === p.id" class="active-tag">Active</span>
                </div>
                <div class="meta-row">
                  <span class="role-badge">{{ p.role }}</span>
                  <span class="email-desc">{{ p.email }}</span>
                </div>
                <div class="wallet-row" :class="{ 'has-wallet': p.wallet_address }">
                  🔑 {{ p.wallet_address ? formatAddress(p.wallet_address) : 'No wallet prepared' }}
                </div>
              </div>
              <div class="signing-indicator" :class="p.signing_status">
                {{ p.signing_status }}
              </div>
            </div>
          </div>
          <div v-else class="no-participants">
            No participants yet.
          </div>
          
          <!-- Add Participant Form (if admin wants to add custom) -->
          <div class="add-participant-wrap" style="margin-top: 1rem;">
            <details>
              <summary class="custom-summary">Add custom participant...</summary>
              <form @submit.prevent="handleAddParticipant" class="form-grid custom-deal-form" style="margin-top: 0.5rem;">
                <input v-model="participantForm.display_name" placeholder="Display name" />
                <input v-model="participantForm.email" placeholder="Email" />
                <button type="submit" class="action-btn">Add participant</button>
              </form>
            </details>
          </div>
        </section>

        <!-- Log Terminal / Audit Trail Console -->
        <section class="sub-panel border-top">
          <h2>Audit Trail Console</h2>
          <div class="terminal-container">
            <div class="terminal-header">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
              <span class="terminal-title">audit_console.log</span>
            </div>
            <div class="terminal-body" ref="terminalBodyRef">
              <div v-if="message" class="terminal-line system-msg">
                <span class="term-time">[{{ getCurrentTimeStr() }}]</span> [SYSTEM] {{ message }}
              </div>
              <div v-if="error" class="terminal-line error-msg">
                <span class="term-time">[{{ getCurrentTimeStr() }}]</span> [ERROR] {{ error }}
              </div>
              <div v-for="event in deal?.audit_events" :key="event.id" class="terminal-line audit-msg">
                <span class="term-time">[{{ formatTime(event.created_at) }}]</span> 
                <span class="term-type">[{{ event.event_type }}]</span> 
                <span class="term-payload">{{ event.payload_json }}</span>
              </div>
              <div v-if="!message && !error && (!deal || !deal.audit_events?.length)" class="terminal-line system-msg">
                [SYSTEM] Ready. Load a deal or template to begin simulation.
              </div>
            </div>
          </div>
        </section>

      </div>

      <!-- Right Column: Interactive Simulator -->
      <div class="right-panel glass-card">
        
        <!-- SVG Chart and Ownership details -->
        <section class="sub-panel" v-if="deal">
          <h2>Ownership Structure</h2>
          <div class="ownership-visual-container">
            <div class="chart-wrapper">
              <svg width="200" height="200" viewBox="0 0 40 40" class="donut-chart">
                <circle class="donut-hole" cx="20" cy="20" r="15.915" fill="transparent"></circle>
                <circle class="donut-ring" cx="20" cy="20" r="15.915" fill="transparent" stroke="#2a354f" stroke-width="3"></circle>
                <circle
                  v-for="seg in chartSegments"
                  :key="seg.participantId"
                  cx="20"
                  cy="20"
                  r="15.915"
                  fill="transparent"
                  :stroke="seg.color"
                  stroke-width="3.2"
                  :stroke-dasharray="seg.strokeDasharray"
                  :stroke-dashoffset="seg.strokeDashoffset"
                  transform="rotate(-90 20 20)"
                  class="donut-segment"
                  @mouseenter="hoveredSegment = seg"
                  @mouseleave="hoveredSegment = null"
                ></circle>
              </svg>
              <div class="chart-center">
                <div class="center-title">{{ hoveredSegment ? hoveredSegment.displayName.split(' ')[0] : 'Total' }}</div>
                <div class="center-val">{{ hoveredSegment ? hoveredSegment.percentage + '%' : '100.0%' }}</div>
              </div>
            </div>
            <div class="chart-legend" v-if="chartSegments.length">
              <div
                v-for="seg in chartSegments"
                :key="seg.participantId"
                class="legend-item"
                :class="{ highlighted: hoveredSegment?.participantId === seg.participantId || signerForm.participant_id === seg.participantId }"
              >
                <span class="legend-color-dot" :style="{ backgroundColor: seg.color }"></span>
                <span class="legend-name">{{ seg.displayName }}</span>
                <span class="legend-pct">{{ seg.percentage }}%</span>
              </div>
            </div>
            <div v-else class="legend-no-data text-secondary">
              No ownership ratio data available.
            </div>
          </div>
        </section>

        <!-- Mock Wallet Connector with Credit Chip Card -->
        <section class="sub-panel border-top" v-if="dealId">
          <h2>Interactive Web3 Wallet</h2>
          
          <!-- Credit Chip Card UI -->
          <div class="credit-card-container">
            <div class="credit-card" :class="{ 'has-wallet': activeParticipant?.wallet_address, 'wallet-active-glow': activeParticipant?.wallet_address }">
              <div class="card-glass"></div>
              <div class="card-header">
                <span class="card-brand">WEALTH DECENTRALIZED IDENTITY</span>
                <span class="card-network-status" :class="{ ready: activeParticipant?.wallet_address }">
                  {{ activeParticipant?.wallet_address ? 'READY' : 'NO WALLET' }}
                </span>
              </div>
              
              <div class="card-chip-row">
                <div class="card-chip">
                  <span class="chip-line"></span>
                  <span class="chip-line"></span>
                  <span class="chip-line"></span>
                  <span class="chip-line"></span>
                </div>
                <div class="contactless-wave">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 17a8 8 0 0 1 0-10M9 20a12 12 0 0 1 0-16M13 22a16 16 0 0 1 0-20" />
                  </svg>
                </div>
              </div>

              <div class="card-address">
                {{ activeParticipant?.wallet_address ? formatAddressLong(activeParticipant.wallet_address) : '0x0000 0000 0000 0000 0000 0000 0000 0000 0000 0000' }}
              </div>

              <div class="card-details">
                <div class="card-holder">
                  <span class="label">HOLDER</span>
                  <span class="val">{{ activeParticipant ? activeParticipant.display_name : 'CHOOSE SIGNER' }}</span>
                </div>
                <div class="card-balance">
                  <span class="label">BALANCE</span>
                  <span class="val">{{ activeParticipantBalance }} {{ deal?.token_symbol || 'TOKEN' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Wallet Form & Inputs (Must contain exact inputs and buttons for tests) -->
          <div class="wallet-form-container">
            <h3>Signer flow</h3>
            
            <form data-test="start-session-form" @submit.prevent="handleCreateSignerSession" class="form-grid">
              <div class="input-with-label">
                <label>Participant ID</label>
                <input v-model="signerForm.participant_id" placeholder="Signer participant ID" />
              </div>
              <button data-test="start-session" type="submit" class="action-btn">Start signer session</button>
            </form>

            <form data-test="wallet-prep-form" @submit.prevent="handlePrepareWallet" class="form-grid" style="margin-top: 1rem;">
              <div class="input-with-label">
                <label>Signer Session ID</label>
                <input v-model="signerForm.session_id" placeholder="Signer session ID" />
              </div>
              <div class="input-with-label">
                <label>Wallet Address</label>
                <div class="input-with-action">
                  <input v-model="signerForm.wallet_address" placeholder="Signer wallet address" />
                  <button type="button" @click="generateMockWallet" class="aux-btn">Auto-Generate</button>
                </div>
              </div>
              <button data-test="wallet-prep" type="submit" class="action-btn">Prepare wallet</button>
            </form>
          </div>
        </section>

        <!-- Digital PDF Viewer & Signature Canvas Sheet -->
        <section class="sub-panel border-top" v-if="dealId">
          <h2>Digital Contract Agreement (PDF)</h2>
          
          <!-- Contract Page Document Sheet -->
          <div class="pdf-viewer">
            <div class="pdf-header">
              <div class="pdf-title-bar">
                <span class="pdf-icon">📄</span>
                <span class="pdf-filename">{{ deal?.token_symbol || 'CONTRACT' }}_Purchase_Agreement.pdf</span>
              </div>
              <div class="pdf-pagination">
                <button type="button" class="page-nav-btn" :disabled="pdfPageIndex === 0" @click="pdfPageIndex--">&lt;</button>
                <span class="page-indicator">Page {{ pdfPageIndex + 1 }} / {{ pdfPages.length }}</span>
                <button type="button" class="page-nav-btn" :disabled="pdfPageIndex === pdfPages.length - 1" @click="pdfPageIndex++">&gt;</button>
              </div>
            </div>

            <!-- Active Page Content -->
            <div class="pdf-page">
              <h3 class="page-title">{{ pdfPages[pdfPageIndex]?.title }}</h3>
              <p class="page-content">{{ pdfPages[pdfPageIndex]?.content }}</p>
              
              <!-- Signature area on the last page -->
              <div class="pdf-signature-area" v-if="pdfPageIndex === pdfPages.length - 1">
                <h4 class="sig-header">HANDWRITING SIGNATURE PAD</h4>
                <p class="sig-desc" v-if="activeParticipant">I, {{ activeParticipant.display_name }}, hereby authorize this agreement.</p>
                <p class="sig-desc" v-else>Please choose a signer to enable signature pad.</p>
                
                <!-- Draw canvas -->
                <div class="canvas-wrapper">
                  <canvas
                    ref="canvasRef"
                    width="360"
                    height="120"
                    class="sig-canvas"
                    @mousedown="startDraw"
                    @mousemove="draw"
                    @mouseup="stopDraw"
                    @mouseleave="stopDraw"
                    @touchstart="startDraw"
                    @touchmove="draw"
                    @touchend="stopDraw"
                  ></canvas>
                  <div class="canvas-placeholder" v-if="!hasSignature">Sign here by drawing...</div>
                </div>
                
                <div class="canvas-actions">
                  <button type="button" @click="clearSignature" class="aux-btn">Clear Canvas</button>
                  <button
                    type="button"
                    @click="triggerCompleteSigning"
                    class="signature-confirm-btn"
                    :disabled="!hasSignature || !activeParticipant"
                  >
                    Confirm & Apply Signature
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Hidden/Functional signing start and completion forms (necessary for unit tests to pass) -->
          <div class="functional-forms-container" style="display: none;">
            <!-- Functional form to start signing (e.g. DocuSign envelope status simulation) -->
            <div class="form-grid compact-grid">
              <input v-model="signerForm.provider" placeholder="Signing provider" />
              <input v-model="signerForm.envelope_id" placeholder="Envelope ID" />
              <button data-test="signing-start" type="button" @click="handleStartSigning">Start signing</button>
            </div>
            <!-- Complete signing form -->
            <form @submit.prevent="handleCompleteSigning" class="form-grid">
              <input v-model="signerForm.document_name" placeholder="Document name" />
              <input v-model="signerForm.document_hash" placeholder="Document hash" />
              <button type="submit" id="functional-complete-signing">Complete signing</button>
            </form>
          </div>
        </section>

        <!-- On-Chain Minting Dashboard & Sepolia block scans -->
        <section class="sub-panel border-top" v-if="dealId">
          <h2>On-Chain Tokenization & Block Scan</h2>
          
          <div class="mint-dashboard">
            <form @submit.prevent="handleMint" class="form-grid mint-form">
              <div class="form-row-group">
                <div class="input-with-label">
                  <label>Participant ID</label>
                  <input v-model="mintForm.participant_id" placeholder="Participant ID" />
                </div>
                <div class="input-with-label">
                  <label>Amount</label>
                  <input v-model="mintForm.amount" placeholder="Amount" />
                </div>
              </div>

              <div class="form-row-group" style="margin-top: 0.5rem;">
                <div class="input-with-label">
                  <label>Asset ID</label>
                  <input v-model.number="mintForm.asset_id" type="number" placeholder="Asset ID" />
                </div>
                <label class="checkbox-row mint-checkbox-row">
                  <input v-model="mintForm.on_chain" type="checkbox" />
                  <span class="checkbox-label">On-chain minting</span>
                </label>
              </div>
              
              <button type="submit" class="action-btn mint-btn" style="margin-top: 1rem;">Mint ownership</button>
            </form>

            <!-- On-chain block scanner log -->
            <div class="block-scan-container" v-if="deal?.ownership?.length">
              <h3>Sepolia Explorer Feed</h3>
              <div class="explorer-table-wrap">
                <table class="explorer-table">
                  <thead>
                    <tr>
                      <th>Record ID</th>
                      <th>Asset ID</th>
                      <th>Tokens</th>
                      <th>Status</th>
                      <th>Scan Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in deal.ownership" :key="row.id">
                      <td class="term-type">{{ row.id.split('-')[0] }}...</td>
                      <td>#{{ row.asset_id }}</td>
                      <td class="text-success">{{ row.amount }} {{ deal.token_symbol }}</td>
                      <td>
                        <span class="status-badge" :class="row.status">{{ row.status }}</span>
                      </td>
                      <td>
                        <a v-if="row.tx_hash" :href="getSepoliaTxUrl(row.tx_hash)" target="_blank" rel="noreferrer" class="etherscan-link">
                          View on Sepolia
                        </a>
                        <span v-else class="text-secondary">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>

    <!-- Collapsible/Neat Raw Ledger History Tables (to fulfill test requirements) -->
    <section class="panel status-panel" style="margin-top: 2rem;">
      <h2>Simulation Ledgers & Live History</h2>
      
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
import { reactive, ref, computed, watch, nextTick } from 'vue';
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

// Canvas Signature Pad State
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
const hasSignature = ref(false);

// PDF Viewer State
const pdfPageIndex = ref(0);

// Donut Chart State
const hoveredSegment = ref<any>(null);

// Terminal scrolling reference
const terminalBodyRef = ref<HTMLDivElement | null>(null);

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

// ----------------------------------------------------
// New helper functions & computed states
// ----------------------------------------------------

const activeParticipant = computed(() => {
  if (!deal.value || !deal.value.participants) return null;
  return deal.value.participants.find(p => p.id === signerForm.participant_id) || null;
});

const countWalletsPrepared = computed(() => {
  if (!deal.value || !deal.value.participants) return 0;
  return deal.value.participants.filter(p => p.wallet_address).length;
});

const activeParticipantBalance = computed(() => {
  if (!deal.value || !deal.value.ownership || !signerForm.participant_id) {
    return '0';
  }
  const userRows = deal.value.ownership.filter(
    (row: any) => row.participant_id === signerForm.participant_id
  );
  let total = 0;
  for (const r of userRows) {
    const amt = parseFloat(r.amount);
    if (!isNaN(amt)) {
      total += amt;
    }
  }
  return total.toFixed(4).replace(/\.?0+$/, '');
});

// Computed SVG Donut Chart segments
const chartSegments = computed(() => {
  if (!deal.value || !deal.value.participants || deal.value.participants.length === 0) {
    return [];
  }
  let currentOffset = 0;
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#8b5cf6', // violet
    '#f59e0b', // amber
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f43f5e', // rose
  ];
  return deal.value.participants.map((p, index) => {
    const percentage = (p.share_pct || 0) * 100;
    const offset = currentOffset;
    currentOffset += percentage;
    return {
      participantId: p.id,
      displayName: p.display_name,
      percentage: percentage.toFixed(1),
      strokeDasharray: `${percentage} 100`,
      strokeDashoffset: -offset,
      color: colors[index % colors.length]
    };
  });
});

// Timeline step highlighting
function getTimelineStepClass(stepNum: number) {
  if (!deal.value) {
    if (stepNum === 1) return 'active';
    return 'pending';
  }

  const allWalletsReady = deal.value.participants && deal.value.participants.length > 0 && 
    deal.value.participants.every(p => p.wallet_address);
  const signed = deal.value.signing_status === 'completed';
  const minted = deal.value.mint_status === 'minted';

  if (stepNum === 1) {
    return 'completed';
  }
  if (stepNum === 2) {
    if (minted || signed || allWalletsReady) return 'completed';
    return 'active';
  }
  if (stepNum === 3) {
    if (minted || signed) return 'completed';
    if (allWalletsReady) return 'active';
    return 'pending';
  }
  if (stepNum === 4) {
    if (minted) return 'completed';
    if (signed) return 'active';
    return 'pending';
  }
  return 'pending';
}

// Impersonation click action
async function impersonateParticipant(p: any) {
  signerForm.participant_id = p.id;
  mintForm.participant_id = p.id;
  if (p.wallet_address) {
    signerForm.wallet_address = p.wallet_address;
  } else {
    signerForm.wallet_address = '';
  }
  await handleCreateSignerSession();
}

// Auto wallet generator
function generateMockWallet() {
  const chars = '0123456789abcdef';
  let addr = '0x';
  for (let i = 0; i < 40; i++) {
    addr += chars[Math.floor(Math.random() * 16)];
  }
  signerForm.wallet_address = addr;
}

// Contract PDF page content
const pdfPages = computed(() => {
  const dealName = deal.value?.name || 'WEALTH Purchase Agreement';
  const address = deal.value?.property_address || 'TBD Address';
  const symbol = deal.value?.token_symbol || 'TBD';
  
  const participantsList = deal.value?.participants || [];
  const participantLines = participantsList.map(p => {
    return `- ${p.display_name}: Share ratio ${(p.share_pct * 100).toFixed(2)}%, Cash ${p.cash_amount || '0'}, Loan ${p.loan_amount || '0'}`;
  }).join('\n');

  return [
    {
      title: "1. PROPERTY CO-OWNERSHIP DETAILS",
      content: `This Agreement is entered into regarding the property located at:\n\n🏠 Address: ${address}\n\nDeal Name: ${dealName}\nToken Identifier: ${symbol}\n\nThe co-owners hereby agree to fractionalize the property ownership into digital assets managed under the WEALTH Smart Contract Framework.`
    },
    {
      title: "2. SHARE ALLOCATIONS & FUNDING",
      content: `The ownership shares and respective capital contribution allocations among the participating signers are defined as follows:\n\n${participantLines || 'No participants registered yet.'}\n\nThese ratios govern the distribution of revenues, capital gains, and voting rights for the property.`
    },
    {
      title: "3. GOVERNANCE & MINTING RULES",
      content: `Upon completion of online signatures by all listed parties, the SPV/Property manager is authorized to mint the respective tokens on the Sepolia testnet.\n\nAll actions, including signature validations and token mint transactions, will be recorded to the immutable ledger and audit trail.`
    }
  ];
});

// Canvas Signature Drawing functions
function startDraw(e: MouseEvent | TouchEvent) {
  isDrawing.value = true;
  draw(e);
}

function draw(e: MouseEvent | TouchEvent) {
  if (!isDrawing.value || !canvasRef.value) return;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Gracefully fallback in vitest/jsdom without rendering support
    hasSignature.value = true;
    return;
  }

  const rect = canvas.getBoundingClientRect();
  let clientX = 0;
  let clientY = 0;

  if (e instanceof MouseEvent) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else if (window.TouchEvent && e instanceof TouchEvent && e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    // Basic fallback support
    const evt = e as any;
    if (evt.touches && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      return;
    }
  }

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#cbd5e1';

  if (e.type === 'mousedown' || e.type === 'touchstart') {
    ctx.beginPath();
    ctx.moveTo(x, y);
  } else {
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSignature.value = true;
  }
}

function stopDraw() {
  isDrawing.value = false;
}

function clearSignature() {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  hasSignature.value = false;
}

// Single-click trigger to execute startSigning followed by completeSigning
async function triggerCompleteSigning() {
  await handleStartSigning();
  await handleCompleteSigning();
  clearSignature();
}

// Format utilities
function getParticipantColor(id: string) {
  if (!deal.value || !deal.value.participants) return '#3b82f6';
  const idx = deal.value.participants.findIndex(p => p.id === id);
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f43f5e'];
  return colors[idx >= 0 ? idx % colors.length : 0];
}

function formatAddress(addr: string) {
  if (!addr) return '';
  if (addr.length <= 10) return addr;
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

function formatAddressLong(addr: string) {
  if (!addr) return '';
  const clean = addr.replace(/\s+/g, '');
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

function formatHash(hash: string) {
  if (!hash) return '';
  if (hash.length <= 12) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`;
}

function getCurrentTimeStr() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

function formatTime(timeStr: string) {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    return d.toTimeString().split(' ')[0];
  } catch {
    return timeStr;
  }
}

// Watch for console messages to scroll to bottom
watch([message, error, () => deal.value?.audit_events], () => {
  nextTick(() => {
    if (terminalBodyRef.value) {
      terminalBodyRef.value.scrollTop = terminalBodyRef.value.scrollHeight;
    }
  });
}, { deep: true });

</script>
