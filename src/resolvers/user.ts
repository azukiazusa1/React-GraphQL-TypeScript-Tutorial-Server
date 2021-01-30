import { User } from "../entities/User";
import { MyContext } from "../types";
import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Resolver } from "type-graphql";
import argon2 from 'argon2'

@InputType()
class UserNamePasswordInput {
  @Field()
  usrename: string
  @Field()
  password: string
}

@ObjectType()
class FieldError {
  @Field()
  field: string

  @Field()
  message: string
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[]

  @Field(() => User, { nullable: true })
  user?: User
}

@Resolver()
export class UserResolver {
  @Query(() => User, { nullable: true })
  async me(
    @Ctx() { req, em }: MyContext
  ) {
    // you are not logged in 
    if (!req.session.userId) {
      return null
    }

    const user = em.findOne(User, { id :req.session.userId })
    return user
  }
  @Mutation(() => UserResponse)
  async register(
    @Arg('options', () => UserNamePasswordInput) options: UserNamePasswordInput,
    @Ctx() { em }: MyContext
  ): Promise<UserResponse> {
    const hashedPassword = await argon2.hash(options.password)
    const user = em.create(User, { 
      username: options.usrename, password: hashedPassword 
    })
    try {
      await em.persistAndFlush(user)
    } catch (err) {
      if (err.code === '23505') {
        return {
          errors: [{
            field: 'username',
            message: 'username already taken'
          }]
        }
      }
      console.error(err)
    }
    return { user }
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg('options', () => UserNamePasswordInput) options: UserNamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    if (options.usrename.length <= 2) {
      return {
        errors: [{
          field: 'username',
          message: 'length must be greater then 2'
        }]
      }
    }
    const user = await em.findOne(User, { username: options.usrename })
    if (!user) {
      return {
        errors: [{
          field: 'username',
          message: "that username doesn't exists"
        }]
      }
    }

    if (options.password.length <= 2) {
      return {
        errors: [{
          field: 'password',
          message: 'length must be greater then 2'
        }]
      }
    }
    const valid = await argon2.verify(user.password, options.password)

    if (!valid) {
      return {
        errors: [
          {
            field: 'password',
            message: 'incorrect password'
          }
        ]
      }
    }

    req.session!.userId = user.id

    return { user }
  }
}