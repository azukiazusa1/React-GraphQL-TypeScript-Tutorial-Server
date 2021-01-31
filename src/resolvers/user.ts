import { User } from "../entities/User";
import { MyContext } from "../types";
import { Arg, Ctx, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql";
import argon2 from 'argon2'
import { COOKIE_NAME } from "../constants";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "../utils/validateRegister";

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
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg('email') email: string,
    @Ctx() { em } : MyContext
  ) {
    const user = await em.findOne(User, { email })
    return !!user
  }
  
  @Query(() => User, { nullable: true })
  async me(
    @Ctx() { req, em }: MyContext
  ) {
    // you are not logged in 
    if (!req.session.userId) {
      return null
    }

    const user = em.findOne(User, { id: req.session.userId })
    return user
  }
  @Mutation(() => UserResponse)
  async register(
    @Arg('options', () => UsernamePasswordInput) options: UsernamePasswordInput,
    @Ctx() { em }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options)
    if (errors) {
      return { errors }
    }
    const hashedPassword = await argon2.hash(options.password)
    const user = em.create(User, {
      username: options.username,
      email: options.email, 
      password: hashedPassword
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
    @Arg('usernameOrEmail') usernameOrEmail: string,
    @Arg('password') password: string,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOne(User, 
      usernameOrEmail.includes('@') ? 
      { email: usernameOrEmail } :
      { username: usernameOrEmail }
    )
    if (!user) {
      return {
        errors: [{
          field: 'username',
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