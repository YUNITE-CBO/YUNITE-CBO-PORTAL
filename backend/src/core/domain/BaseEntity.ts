export abstract class BaseEntity {
  public readonly id: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public deletedAt: Date | null;
  public isActive: boolean;
  public version: number;

  constructor(id: string) {
    this.id = id;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.deletedAt = null;
    this.isActive = true;
    this.version = 1;
  }

  public softDelete(): void {
    this.deletedAt = new Date();
    this.isActive = false;
    this.version++;
  }

  public restore(): void {
    this.deletedAt = null;
    this.isActive = true;
    this.version++;
  }

  protected markUpdated(): void {
    this.updatedAt = new Date();
    this.version++;
  }
}