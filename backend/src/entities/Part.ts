import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Maintenance } from './Maintenance';
import { Vehicle } from './Vehicle';

export const PART_CATEGORIES = [
  'Encendido',
  'Motor',
  'Frenos',
  'Suspensión',
  'Transmisión',
  'Eléctrico',
  'Neumáticos',
  'Filtros y lubricantes',
  'Carrocería',
  'Otro',
] as const;

export type PartCategory = (typeof PART_CATEGORIES)[number];

@Entity({ name: 'parts' })
export class Part {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_parts_vehicle_id')
  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Index('IDX_parts_maintenance_id')
  @Column({ name: 'maintenance_id', type: 'uuid', nullable: true })
  maintenanceId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({
    type: 'enum',
    enum: [...PART_CATEGORIES],
    enumName: 'part_category',
  })
  category!: PartCategory;

  /** Costo en pesos chilenos (CLP), entero sin decimales. */
  @Column({ type: 'int' })
  cost!: number;

  /** Fecha de compra en formato ISO YYYY-MM-DD. */
  @Column({ name: 'purchase_date', type: 'varchar', length: 10 })
  purchaseDate!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @ManyToOne(() => Maintenance, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'maintenance_id' })
  maintenance!: Maintenance | null;
}
