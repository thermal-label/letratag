/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import App from '../App.vue';

describe('debug app', () => {
  it('renders the header and connection panel without a Bluetooth API', () => {
    // Stub the Bluetooth global so component code that *might* read
    // it on mount has something to look at. The component shouldn't
    // call requestDevice on mount — only on button click.
    const fakeBluetooth = { requestDevice: vi.fn() } as unknown as Bluetooth;
    Object.defineProperty(navigator, 'bluetooth', {
      value: fakeBluetooth,
      configurable: true,
    });
    const wrapper = mount(App);
    expect(wrapper.text()).toContain('Debug & Verification Harness');
    expect(wrapper.text()).toContain('Connect via Web Bluetooth');
    expect(wrapper.text()).toContain('T1 — Single pixel at (0, 0)');
  });
});
