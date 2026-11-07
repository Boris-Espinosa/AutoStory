import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';
import { Vehicle } from './Vehicle';

export enum SharingRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'sharing_requests' })
@Check(
  'CHK_sharing_requests_distinct_users',
  `"sender_user_id" <> "receiver_user_id"`,
)
export class SharingRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({ name: 'sender_user_id', type: 'varchar', length: 64 })
  senderUserId!: string;

  @Column({ name: 'receiver_user_id', type: 'varchar', length: 64 })
  receiverUserId!: string;

  @Column({
    type: 'enum',
    enum: SharingRequestStatus,
    enumName: 'sharing_request_status',
    default: SharingRequestStatus.PENDING,
  })
  status!: SharingRequestStatus;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_user_id' })
  sender!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receiver_user_id' })
  receiver!: User;
}
