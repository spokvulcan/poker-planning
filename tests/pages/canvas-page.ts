import { Page, Locator, expect } from "@playwright/test";
import { safeClick } from "../utils/test-helpers";

export class CanvasPage {
  readonly page: Page;
  readonly canvas: Locator;
  readonly zoomInButton: Locator;
  readonly zoomOutButton: Locator;
  readonly fitViewButton: Locator;
  readonly fullscreenButton: Locator;
  readonly minimap: Locator;
  readonly nodes: Locator;
  readonly edges: Locator;

  constructor(page: Page) {
    this.page = page;

    // Canvas elements
    this.canvas = page.locator(".react-flow");
    this.nodes = page.locator(".react-flow__node");
    this.edges = page.locator(".react-flow__edge");
    
    // Controls
    this.zoomInButton = page.getByTestId("zoom-in-button");
    this.zoomOutButton = page.getByTestId("zoom-out-button");
    this.fitViewButton = page.getByTestId("fit-view-button");
    this.fullscreenButton = page.getByTestId("fullscreen-button");
    this.minimap = page.getByTestId("minimap");
  }

  async waitForCanvasReady(): Promise<void> {
    await expect(this.canvas).toBeVisible();
    // Wait for initial render to complete
    await this.page.waitForTimeout(500);
  }

  async panCanvas(deltaX: number, deltaY: number): Promise<void> {
    const canvasBox = await this.canvas.boundingBox();
    if (!canvasBox) throw new Error("Canvas not found");

    const centerX = canvasBox.x + canvasBox.width / 2;
    const centerY = canvasBox.y + canvasBox.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.down();
    await this.page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 10 });
    await this.page.mouse.up();
  }

  async zoomIn(): Promise<void> {
    await safeClick(this.zoomInButton);
    await this.page.waitForTimeout(300); // Wait for zoom animation
  }

  async zoomOut(): Promise<void> {
    await safeClick(this.zoomOutButton);
    await this.page.waitForTimeout(300); // Wait for zoom animation
  }

  async fitView(): Promise<void> {
    await safeClick(this.fitViewButton);
    await this.page.waitForTimeout(500); // Wait for fit animation
  }

  async toggleFullscreen(): Promise<void> {
    await safeClick(this.fullscreenButton);
    await this.page.waitForTimeout(300);
  }

  async dragNode(nodeTestId: string, deltaX: number, deltaY: number): Promise<void> {
    const node = this.page.getByTestId(nodeTestId);
    await expect(node).toBeVisible();

    const nodeBox = await node.boundingBox();
    if (!nodeBox) throw new Error("Node not found");

    const startX = nodeBox.x + nodeBox.width / 2;
    const startY = nodeBox.y + nodeBox.height / 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await this.page.mouse.up();
  }

  async getNodeCount(): Promise<number> {
    return await this.nodes.count();
  }

  async expectNodeCount(count: number): Promise<void> {
    await expect(this.nodes).toHaveCount(count);
  }

  async expectNodeVisible(nodeTestId: string): Promise<void> {
    const node = this.page.getByTestId(nodeTestId);
    await expect(node).toBeVisible();
  }

  async getNodePosition(nodeTestId: string): Promise<{ x: number; y: number }> {
    const node = this.page.getByTestId(nodeTestId);
    const transform = await node.getAttribute("transform");
    
    if (!transform) {
      throw new Error("Node transform not found");
    }

    // Parse transform translate values
    const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
    if (!match) {
      throw new Error("Could not parse transform");
    }

    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2])
    };
  }

  async expectNodeAtPosition(nodeTestId: string, expectedX: number, expectedY: number, tolerance: number = 5): Promise<void> {
    const position = await this.getNodePosition(nodeTestId);
    expect(Math.abs(position.x - expectedX)).toBeLessThan(tolerance);
    expect(Math.abs(position.y - expectedY)).toBeLessThan(tolerance);
  }

  async isMinimapVisible(): Promise<boolean> {
    return await this.minimap.isVisible();
  }

  async getZoomLevel(): Promise<number> {
    return await this.page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      if (!viewport) return 1;
      
      const transform = window.getComputedStyle(viewport).transform;
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
  }

  async expectZoomLevel(expectedZoom: number, tolerance: number = 0.1): Promise<void> {
    const zoom = await this.getZoomLevel();
    expect(Math.abs(zoom - expectedZoom)).toBeLessThan(tolerance);
  }
}