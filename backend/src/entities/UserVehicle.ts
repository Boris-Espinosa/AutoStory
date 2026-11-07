import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './User';
import { Vehicle } from './Vehicle';

export enum UserVehicleRole {
  OWNER = 'OWNER',
  GUEST = 'GUEST',
}

@Entity({ name: 'user_vehicles' })
@Index('UQ_user_vehicles_owner', ['vehicleId'], {
  unique: true,
  where: `"role" = 'OWNER'`,
})
export class UserVehicle {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @PrimaryColumn({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({
    type: 'enum',
    enum: UserVehicleRole,
    enumName: 'user_vehicle_role',
  })
  role!: UserVehicleRole;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;
}
