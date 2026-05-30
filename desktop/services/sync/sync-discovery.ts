import Bonjour from 'bonjour-service';
import * as os from 'os';
import { EventEmitter } from 'events';
import type { PeerInfo } from './sync-types';

const SERVICE_TYPE = 'ytd-sync';

export class SyncDiscovery extends EventEmitter {
  private bonjour: InstanceType<typeof Bonjour> | null = null;
  private published: any = null;
  private browser: any = null;
  private peers: Map<string, PeerInfo> = new Map();
  private instanceId: string;

  constructor(instanceId: string) {
    super();
    this.instanceId = instanceId;
  }

  startAdvertising(port: number, meta: { deviceName: string; version: string; libraryCount: number }): void {
    if (!this.bonjour) this.bonjour = new Bonjour();

    this.stopAdvertising();
    this.published = this.bonjour.publish({
      name: `ytd-${meta.deviceName}`,
      type: SERVICE_TYPE,
      port,
      txt: {
        instanceId: this.instanceId,
        deviceName: meta.deviceName,
        version: meta.version,
        libraryCount: String(meta.libraryCount),
      },
    });
  }

  stopAdvertising(): void {
    if (this.published) {
      this.published.stop?.();
      this.published = null;
    }
  }

  startBrowsing(): void {
    if (!this.bonjour) this.bonjour = new Bonjour();

    this.stopBrowsing();
    this.browser = this.bonjour.find({ type: SERVICE_TYPE }, (service: any) => {
      const txt = service.txt as any;
      if (!txt || txt.instanceId === this.instanceId) return;

      const peer: PeerInfo = {
        instanceId: txt.instanceId,
        deviceName: txt.deviceName || service.name,
        address: service.referer?.address || service.addresses?.[0] || '',
        port: service.port,
        version: txt.version || '',
        libraryCount: parseInt(txt.libraryCount || '0', 10),
      };

      if (!peer.address) return;

      this.peers.set(peer.instanceId, peer);
      this.emit('peer-found', peer);
    });

    this.browser.on?.('down', (service: any) => {
      const txt = service.txt as any;
      if (txt?.instanceId && this.peers.has(txt.instanceId)) {
        this.peers.delete(txt.instanceId);
        this.emit('peer-lost', txt.instanceId);
      }
    });
  }

  stopBrowsing(): void {
    if (this.browser) {
      this.browser.stop?.();
      this.browser = null;
    }
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  stop(): void {
    this.stopAdvertising();
    this.stopBrowsing();
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.peers.clear();
  }
}
