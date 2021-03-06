import { User } from "../entities/User";
import { MyContext } from "../types";
import { Arg, Ctx, Field, FieldResolver, Mutation, ObjectType, Query, Resolver, Root } from "type-graphql";
import argon2 from 'argon2'
import { COOKIE_NAME, FORGET_PASSWORD_PREFIX } from "../constants";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "../utils/validateRegister";
import { sendEmail } from "../utils/sendEmail";
import {v4 as uuid} from 'uuid'
import { getConnection } from "typeorm";

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

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => String)
  email(@Root() user: User, @Ctx() {req}: MyContext) {
    if (req.session.userId === user.id) {
      return user.email
    }

    return ''
  }

  @Mutation(() => UserResponse)
  async changePassword(
    @Arg('token') token: string,
    @Arg('newPassword') newPassword: string,
    @Ctx() { redis, req }: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length <= 2) {
      return {
          errors: [{
          field: 'newPassword',
          message: 'length must be greater then 2'
        }]
      }
    }

    const key = FORGET_PASSWORD_PREFIX + token
    const userId = await redis.get(key)
    if (!userId) {
      return {
        errors: [{
          field: 'token',
          message: 'token expired'
        }]
      }
    }

    const id = parseInt(userId)
    const user = await User.findOne(id)

    if (!user) {
      return {
        errors: [{
          field: 'token',
          message: 'user no longer exists'
        }]
      }
    }

    const password = await argon2.hash(newPassword)
    await User.update({ id }, { password })

    await redis.del(key)

    // log in user after change password
    req.session.userId = user.id

    return { user }
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg('email') email: string,
    @Ctx() { redis } : MyContext
  ) {
    const user = await User.findOne({ where: { email }})
    if (!user) {
      // the email is not in the db
      return true
    }

    const token = uuid()
    await redis.set(FORGET_PASSWORD_PREFIX + token, user.id, 'ex', 1000 * 60 * 60 * 24 * 3) // 3days

    sendEmail(
      email,
      `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
    )
    return true
  }
  
  @Query(() => User, { nullable: true })
  me(
    @Ctx() { req }: MyContext
  ) {
    // you are not logged in 
    if (!req.session.userId) {
      return null
    }

    return User.findOne(req.session.userId)
  }
  @Mutation(() => UserResponse)
  async register(
    @Arg('options', () => UsernamePasswordInput) options: UsernamePasswordInput,
    @Ctx() { req } : MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options)
    if (errors) {
      return { errors }
    }
    const hashedPassword = await argon2.hash(options.password)
    let user
    try {
      const result = await getConnection().createQueryBuilder().insert().into(User).values({
        username: options.username,
        email: options.email,
        password: hashedPassword
      })
        .returning('*')
        .execute()
      console.log('result', result)
      user = result.raw[0]
    } catch (err) {
      console.log('err', err)
      if (err.code === '23505') {
        return {
          errors: [{
            field: 'username',
            message: 'username already taken'
          }]
        }
      }
    }
    req.session.userId = user.id
    console.log('user', user)
    return { user }
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg('usernameOrEmail') usernameOrEmail: string,
    @Arg('password') password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOne(
      usernameOrEmail.includes('@') ? 
      { where: { email: usernameOrEmail } } :
      { where: { username: usernameOrEmail } }
    )
    if (!user) {
      return {
        errors: [{
          field: 'usernameOrEmail',
          message: "that username doesn't exists"
        }]
      }
    }
    const valid = await argon2.verify(user.password, password)

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

  @Mutation(() => Boolean)
  logout(
    @Ctx() { req, res }: MyContext
  ) {
    return new Promise(resolve => req.session.destroy(err => {
      res.clearCookie(COOKIE_NAME)
      if (err) {
        resolve(false)
        console.error(err)
        return
      }

      resolve(true)
    }))
  }
}