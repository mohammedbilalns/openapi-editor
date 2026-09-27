/**
 * Hand-written, realistic OpenAPI 3.0 document exercising most features the
 * editor models: refs, compositions, discriminators, nullable, enums, formats,
 * defaults/examples, parameters at path and operation level, component
 * parameters/responses, response headers, security (global + per operation),
 * servers with variables and tags.
 */
export const REALISTIC_SPEC_YAML = `
openapi: 3.0.3
info:
  title: Pet Store
  version: 2024-06-20
  description: |
    A realistic pet store.
    Supports **markdown**.
  termsOfService: https://example.com/terms
  contact:
    name: API Team
    email: api@example.com
    url: https://example.com
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html
servers:
  - url: https://{region}.api.example.com/v1
    description: Regional production
    variables:
      region:
        default: eu
        enum: [eu, us]
        description: Deployment region
  - url: http://localhost:8080
tags:
  - name: pets
    description: Everything about pets
  - name: store
security:
  - bearerAuth: []
paths:
  /pets:
    get:
      summary: List pets
      operationId: listPets
      tags: [pets]
      parameters:
        - name: limit
          in: query
          description: Max items
          schema:
            type: integer
            format: int32
            minimum: 1
            maximum: 100
            default: 20
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/PetStatus'
        - $ref: '#/components/parameters/TraceId'
      responses:
        '200':
          description: A page of pets
          headers:
            X-Rate-Limit-Remaining:
              description: Requests left
              schema:
                type: integer
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
        default:
          $ref: '#/components/responses/Error'
    post:
      summary: Create a pet
      operationId: createPet
      tags: [pets]
      security:
        - oauth: [write:pets]
        - apiKey: []
      requestBody:
        required: true
        description: Pet to add
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewPet'
            example:
              name: Rex
              kind: dog
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
        '400':
          $ref: '#/components/responses/Error'
  /pets/{petId}:
    parameters:
      - name: petId
        in: path
        required: true
        description: The pet id
        schema:
          type: string
          format: uuid
    get:
      summary: Get a pet
      operationId: getPet
      tags: [pets]
      responses:
        '200':
          description: The pet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
        '404':
          $ref: '#/components/responses/Error'
    delete:
      operationId: deletePet
      deprecated: true
      tags: [pets]
      responses:
        '204':
          description: Deleted
  /health:
    get:
      operationId: health
      security: []
      responses:
        '200':
          description: OK
          content:
            text/plain:
              schema:
                type: string
                example: ok
components:
  parameters:
    TraceId:
      name: X-Trace-Id
      in: header
      required: false
      schema:
        type: string
  responses:
    Error:
      description: Error payload
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
  schemas:
    Pet:
      allOf:
        - $ref: '#/components/schemas/NewPet'
        - type: object
          required: [id]
          properties:
            id:
              type: string
              format: uuid
              readOnly: true
              example: 7f1c4ce0-0000-4000-8000-000000000000
            tags:
              type: array
              items:
                $ref: '#/components/schemas/Tag'
    NewPet:
      type: object
      description: A pet to create
      additionalProperties: false
      required: [name, kind]
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 64
          pattern: '^[A-Za-z ]+$'
          example: Rex
        kind:
          $ref: '#/components/schemas/PetKind'
        status:
          $ref: '#/components/schemas/PetStatus'
        birthday:
          type: string
          format: date
          nullable: true
        weight:
          type: number
          format: float
          minimum: 0
        vaccinated:
          type: boolean
          default: false
        owner:
          type: object
          description: Inline owner
          properties:
            email:
              type: string
              format: email
    PetKind:
      oneOf:
        - $ref: '#/components/schemas/Dog'
        - $ref: '#/components/schemas/Cat'
      discriminator:
        propertyName: type
        mapping:
          dog: '#/components/schemas/Dog'
          cat: '#/components/schemas/Cat'
    Dog:
      type: object
      properties:
        type:
          type: string
        barks:
          type: boolean
    Cat:
      type: object
      title: Cat
      properties:
        type:
          type: string
        lives:
          type: integer
          default: 9
    PetStatus:
      type: string
      enum: [available, pending, sold]
      default: available
      description: Adoption status
    Priority:
      type: integer
      enum: [1, 2, 3]
    Tag:
      anyOf:
        - type: string
        - $ref: '#/components/schemas/TagObject'
    TagObject:
      type: object
      properties:
        label:
          type: string
    Error:
      type: object
      x-internal: true
      required: [code, message]
      properties:
        code:
          type: integer
          format: int32
        message:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key
    oauth:
      type: oauth2
      description: OAuth2 code flow
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          tokenUrl: https://example.com/oauth/token
          scopes:
            read:pets: Read pets
            write:pets: Modify pets
    oidc:
      type: openIdConnect
      openIdConnectUrl: https://example.com/.well-known/openid-configuration
`;
