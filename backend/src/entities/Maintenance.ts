import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Appointment } from './Appointment';
import { User } from './User';
import { Vehicle } from './Vehicle';
import { Workshop } from './Workshop';

/**
 * Mantención de un vehículo. El índice sobre (vehicle_id, service_date DESC)
 * y los CHECK de kilometraje y costo se crean con SQL en la migración.
 */
@Entity({ name: 'maintenances' })
export class Maintenance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  /** Fecha del servicio en formato ISO YYYY-MM-DD. */
  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'service_mileage', type: 'int' })
  serviceMileage!: number;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  diagnosis!: string | null;

  /** Costo de mano de obra en pesos chilenos (CLP), entero sin decimales. */
  @Column({ name: 'labor_cost', type: 'int', default: 0 })
  laborCost!: number;

  @Column({ name: 'workshop_id', type: 'uuid', nullable: true })
  workshopId!: string | null;

  @Column({ name: 'registered_by_user_id', type: 'varchar', length: 64, nullable: true })
  registeredByUserId!: string | null;

  @Index('UQ_maintenances_appointment', {
    unique: true,
    where: `"appointment_id" IS NOT NULL`,
  })
  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @ManyToOne(() => Workshop, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workshop_id' })
  workshop!: Workshop | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'registered_by_user_id' })
  registeredBy!: User | null;

  @ManyToOne(() => Appointment, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: Appointment | null;
}
