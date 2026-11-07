import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { normalizeLicensePlate } from '../vehicles/license-plate';
import { normalizeVin } from '../vehicles/vin';

const vinTransformer = {
  to: (value: string | null): string | null => normalizeVin(value),
  from: (value: string | null): string | null => value,
};

const licensePlateTransformer = {
  to: (value: string): string => normalizeLicensePlate(value),
  from: (value: string): string => value,
};

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_vehicles_vin')
  @Column({
    type: 'varchar',
    length: 17,
    nullable: true,
    transformer: vinTransformer,
  })
  vin!: string | null;

  @Index('IDX_vehicles_license_plate')
  @Column({
    name: 'license_plate',
    type: 'varchar',
    length: 16,
    transformer: licensePlateTransformer,
  })
  licensePlate!: string;

  @Column({ type: 'varchar', length: 80 })
  brand!: string;

  @Column({ type: 'varchar', length: 80 })
  model!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'current_mileage', type: 'int' })
  currentMileage!: number;

  @Column({ name: 'photo_url', type: 'varchar', length: 512, nullable: true })
  photoUrl!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
